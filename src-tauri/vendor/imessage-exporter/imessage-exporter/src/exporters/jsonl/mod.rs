use std::{
    collections::HashMap,
    fs::File,
    io::{BufWriter, Write},
};

use imessage_database::{
    message_types::{
        expressives::Expressive,
        variants::{CustomBalloon, Tapback, TapbackAction, Variant},
    },
    tables::{
        attachment::Attachment,
        messages::{
            Message,
            models::{AttachmentMeta, AttributedRange, BubbleComponent, GroupAction},
        },
        table::Table,
    },
};
use serde_json::{Value, json};

use crate::{
    app::{
        compatibility::attachment_manager::AttachmentManagerMode, error::RuntimeError,
        runtime::Config,
    },
    exporters::shared::{
        attachment::prepare_attachment,
        driver::ExportState,
        message::MessageContext,
        part::{AttachmentResolver, resolve_run},
    },
};

const FILE_BUFFER_CAPACITY: usize = 64 * 1024;

pub struct JSONL<'a> {
    config: &'a Config,
    state: ExportState,
}

impl<'a> JSONL<'a> {
    pub fn new(config: &'a Config) -> Result<Self, RuntimeError> {
        Ok(Self {
            config,
            state: ExportState::new(config, "jsonl")?,
        })
    }

    pub fn run(&mut self) -> Result<(), RuntimeError> {
        eprintln!(
            "Exporting to {} as jsonl...",
            self.config.options.export_path.display(),
        );

        let mut current_message_row = -1;
        let mut current_message = 0;
        let mut failures: u64 = 0;
        let total_messages = Message::get_count(
            self.config.data_source.db(),
            &self.config.options.query_context,
        )?;
        self.state.pb.start(total_messages);

        let mut statement = Message::stream_rows(
            self.config.data_source.db(),
            &self.config.options.query_context,
        )?;

        for message in Message::rows(&mut statement, [])? {
            let mut msg = message?;

            if msg.rowid == current_message_row {
                self.advance_progress(&mut current_message);
                continue;
            }
            current_message_row = msg.rowid;

            if let Err(why) = self.write_message(&mut msg) {
                failures += 1;
                eprintln!(
                    "Skipping message (rowid={}, guid={}): {}",
                    msg.rowid, msg.guid, why
                );
            }

            self.advance_progress(&mut current_message);
        }
        self.state.pb.finish();

        if failures > 0 {
            eprintln!("{failures} messages skipped due to JSONL export errors.");
        }

        self.flush_all()?;
        Ok(())
    }

    fn write_message(&mut self, msg: &mut Message) -> Result<(), RuntimeError> {
        if let Ok(body) = msg.parse_body(self.config.data_source.db()) {
            msg.apply_body(body);
        }

        let value = self.message_value(msg)?;
        let file = get_or_create_jsonl_file_for(self, msg)?;
        serde_json::to_writer(&mut *file, &value)?;
        file.write_all(b"\n")?;
        Ok(())
    }

    fn message_value(&self, msg: &mut Message) -> Result<Value, RuntimeError> {
        let mut context = MessageContext::resolve(msg, self.config.data_source.db())?;
        let mut resolver = AttachmentResolver::new(&context.attachments);
        let attachment_lookup = attachment_lookup(&context.attachments);

        let parts = msg
            .components
            .iter()
            .enumerate()
            .map(|(idx, part)| self.part_value(msg, idx, part, &mut context, &mut resolver))
            .collect::<Result<Vec<_>, _>>()?;

        self.prepare_remaining_attachments(msg, &mut context.attachments);

        let attachments = context
            .attachments
            .iter()
            .map(|attachment| self.attachment_value(attachment, None))
            .collect::<Vec<_>>();

        let conversation = self.conversation_value(msg);
        let sender = self.sender_value(msg);
        let target = tapback_target_value(msg);
        let translation = self.translation_value(msg);

        Ok(json!({
            "schema": "imessage-exporter.jsonl.v1",
            "rowid": msg.rowid,
            "guid": msg.guid,
            "conversation": conversation,
            "sender": sender,
            "text": msg.text,
            "subject": msg.subject,
            "service": msg.service().to_string(),
            "raw_service": msg.service,
            "variant": variant_value(msg),
            "timestamps": timestamps_value(self.config, msg),
            "flags": flags_value(msg),
            "ids": ids_value(msg),
            "announcement": announcement_value(msg),
            "parts": parts,
            "attachments": attachments,
            "attachment_ranges": attachment_ranges_value(msg, &attachment_lookup),
            "translation": translation,
            "expressive": expressive_value(context.expressive),
            "tapback_target": target,
        }))
    }

    fn part_value(
        &self,
        msg: &Message,
        idx: usize,
        part: &BubbleComponent,
        context: &mut MessageContext<'_>,
        resolver: &mut AttachmentResolver,
    ) -> Result<Value, RuntimeError> {
        Ok(match part {
            BubbleComponent::Run(ranges) => {
                let segments = resolve_run(ranges, resolver)
                    .into_iter()
                    .map(|(range, attachment_idx)| {
                        self.range_value(msg, range, attachment_idx, &mut context.attachments)
                    })
                    .collect::<Result<Vec<_>, _>>()?;

                json!({
                    "index": idx,
                    "kind": "run",
                    "is_edited": msg.is_part_edited(idx),
                    "segments": segments,
                })
            }
            BubbleComponent::App => {
                json!({
                    "index": idx,
                    "kind": "app",
                    "bundle_id": msg.balloon_bundle_id,
                })
            }
            BubbleComponent::Retracted => {
                json!({
                    "index": idx,
                    "kind": "retracted",
                })
            }
        })
    }

    fn range_value(
        &self,
        msg: &Message,
        range: &AttributedRange,
        attachment_idx: Option<usize>,
        attachments: &mut [Attachment],
    ) -> Result<Value, RuntimeError> {
        if let Some(meta) = &range.attachment {
            let attachment = match attachment_idx.and_then(|idx| attachments.get_mut(idx)) {
                Some(attachment) => {
                    self.prepare_attachment(attachment, msg);
                    Some(self.attachment_value(attachment, Some(meta)))
                }
                None => None,
            };

            return Ok(json!({
                "kind": "attachment",
                "range": range_bounds_value(range),
                "emoji_image": range.emoji_image,
                "effects": range.effects.iter().map(|effect| format!("{effect:?}")).collect::<Vec<_>>(),
                "metadata": attachment_meta_value(meta),
                "attachment_index": attachment_idx,
                "attachment": attachment,
            }));
        }

        Ok(json!({
            "kind": "text",
            "range": range_bounds_value(range),
            "text": msg.text.as_deref().and_then(|text| text.get(range.start..range.end)),
            "effects": range.effects.iter().map(|effect| format!("{effect:?}")).collect::<Vec<_>>(),
        }))
    }

    fn prepare_attachment(&self, attachment: &mut Attachment, msg: &Message) {
        if !matches!(
            self.config.options.attachment_manager.mode,
            AttachmentManagerMode::Disabled
        ) {
            let _ = prepare_attachment(self.config, &self.state, attachment, msg);
        }
    }

    fn prepare_remaining_attachments(&self, msg: &Message, attachments: &mut [Attachment]) {
        for attachment in attachments {
            if attachment.copied_path.is_none() {
                self.prepare_attachment(attachment, msg);
            }
        }
    }

    fn attachment_value(&self, attachment: &Attachment, meta: Option<&AttachmentMeta>) -> Value {
        let source_path = attachment.resolved_attachment_path(
            &self.config.options.platform,
            &self.config.options.db_path,
            self.config.options.attachment_root.as_deref(),
        );
        let exported_path = attachment
            .copied_path
            .as_ref()
            .map(|path| self.config.relative_path(path));

        json!({
            "rowid": attachment.rowid,
            "guid": attachment.guid,
            "filename": attachment.filename,
            "display_name": attachment.filename(),
            "transfer_name": attachment.transfer_name,
            "uti": attachment.uti,
            "mime_type": attachment.mime_type,
            "media_type": attachment.mime_type().as_mime_type(),
            "total_bytes": attachment.total_bytes,
            "is_sticker": attachment.is_sticker,
            "hide_attachment": attachment.hide_attachment,
            "emoji_description": attachment.emoji_description,
            "source_path": source_path,
            "exported_path": exported_path,
            "range_metadata": meta.map(attachment_meta_value),
        })
    }

    fn conversation_value(&self, msg: &Message) -> Value {
        match self.config.conversation(msg) {
            Some((chat, real_id)) => {
                let participants = self
                    .config
                    .chatroom_participants
                    .get(&chat.rowid)
                    .map(|ids| {
                        ids.iter()
                            .map(|id| {
                                let real_id = self.config.real_participants.get(id).copied();
                                let display_name = real_id
                                    .and_then(|real| self.config.participants.get(&real))
                                    .map(|name| name.get_display_name().to_string());
                                json!({
                                    "handle_id": id,
                                    "canonical_handle_id": real_id,
                                    "display_name": display_name,
                                })
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();

                json!({
                    "chat_id": chat.rowid,
                    "canonical_chat_id": real_id,
                    "identifier": chat.chat_identifier,
                    "display_name": chat.display_name(),
                    "service": chat.service().to_string(),
                    "participants": participants,
                })
            }
            None => {
                json!({
                    "chat_id": msg.chat_id,
                    "canonical_chat_id": null,
                    "identifier": null,
                    "display_name": null,
                    "service": null,
                    "participants": [],
                })
            }
        }
    }

    fn sender_value(&self, msg: &Message) -> Value {
        let canonical_handle_id = msg
            .handle_id
            .and_then(|id| self.config.real_participants.get(&id).copied());
        let display_name = self
            .config
            .who(msg.handle_id, msg.is_from_me(), &msg.destination_caller_id)
            .to_string();

        json!({
            "handle_id": msg.handle_id,
            "canonical_handle_id": canonical_handle_id,
            "display_name": display_name,
            "destination_caller_id": msg.destination_caller_id,
            "is_from_me": msg.is_from_me(),
        })
    }

    fn translation_value(&self, msg: &Message) -> Option<Value> {
        self.config
            .translation_for(msg)
            .ok()
            .flatten()
            .map(|translation| {
                json!({
                    "translated_text": translation.translated_text,
                    "source_lang": translation.source_lang,
                    "translation_lang": translation.translation_lang,
                })
            })
    }

    fn advance_progress(&self, current_message: &mut u64) {
        *current_message += 1;
        if current_message.is_multiple_of(99) {
            self.state.pb.set_position(*current_message);
        }
    }

    fn flush_all(&mut self) -> Result<(), RuntimeError> {
        for file in self.state.files.values_mut() {
            file.flush()?;
        }
        self.state.orphaned.flush()?;
        Ok(())
    }
}

fn get_or_create_jsonl_file_for<'a, 'b>(
    writer: &'b mut JSONL<'a>,
    message: &Message,
) -> Result<&'b mut BufWriter<File>, RuntimeError> {
    match writer.config.conversation(message) {
        Some((chatroom, _)) => {
            let chatroom_rowid = chatroom.rowid;
            let filename = match writer.state.route.get(&chatroom_rowid) {
                Some(name) => name.clone(),
                None => {
                    let name = writer.config.filename(chatroom);
                    writer.state.route.insert(chatroom_rowid, name.clone());
                    name
                }
            };

            if !writer.state.files.contains_key(&filename) {
                let mut path = writer.config.options.export_path.clone();
                path.push(&filename);
                let file = File::options().append(true).create(true).open(&path)?;
                writer.state.files.insert(
                    filename.clone(),
                    BufWriter::with_capacity(FILE_BUFFER_CAPACITY, file),
                );
            }
            Ok(writer.state.files.get_mut(&filename).unwrap())
        }
        None => Ok(&mut writer.state.orphaned),
    }
}

fn timestamps_value(config: &Config, msg: &Message) -> Value {
    json!({
        "date": timestamp_value(msg.date, || msg.date(config.offset).ok().map(|date| date.to_rfc3339())),
        "date_read": timestamp_value(msg.date_read, || msg.date_read(config.offset).ok().map(|date| date.to_rfc3339())),
        "date_delivered": timestamp_value(msg.date_delivered, || msg.date_delivered(config.offset).ok().map(|date| date.to_rfc3339())),
        "date_edited": timestamp_value(msg.date_edited, || msg.date_edited(config.offset).ok().map(|date| date.to_rfc3339())),
    })
}

fn timestamp_value<F>(raw: i64, convert: F) -> Value
where
    F: FnOnce() -> Option<String>,
{
    json!({
        "raw": raw,
        "iso": if raw == 0 {
            None
        } else {
            convert()
        },
    })
}

fn flags_value(msg: &Message) -> Value {
    json!({
        "is_from_me": msg.is_from_me(),
        "is_read": msg.is_read,
        "is_reply": msg.is_reply(),
        "is_deleted": msg.is_deleted(),
        "is_edited": msg.is_edited(),
        "is_fully_unsent": msg.is_fully_unsent(),
        "is_announcement": msg.is_announcement(),
        "has_attachments": msg.has_attachments(),
        "has_replies": msg.has_replies(),
        "is_tapback": msg.is_tapback(),
        "is_poll": msg.is_poll(),
        "is_poll_vote": msg.is_poll_vote(),
        "is_poll_update": msg.is_poll_update(),
        "is_shareplay": msg.is_shareplay(),
    })
}

fn ids_value(msg: &Message) -> Value {
    json!({
        "chat_id": msg.chat_id,
        "deleted_from": msg.deleted_from,
        "handle_id": msg.handle_id,
        "other_handle": msg.other_handle,
        "associated_message_guid": msg.associated_message_guid,
        "associated_message_type": msg.associated_message_type,
        "associated_message_emoji": msg.associated_message_emoji,
        "thread_originator_guid": msg.thread_originator_guid,
        "thread_originator_part": msg.thread_originator_part,
        "balloon_bundle_id": msg.balloon_bundle_id,
        "expressive_send_style_id": msg.expressive_send_style_id,
    })
}

fn variant_value(msg: &Message) -> Value {
    match msg.variant() {
        Variant::Normal => json!({ "kind": "normal" }),
        Variant::Edited => json!({ "kind": "edited" }),
        Variant::Tapback(idx, action, tapback) => json!({
            "kind": "tapback",
            "target_part_index": idx,
            "action": tapback_action_value(action),
            "tapback": tapback_value(tapback),
        }),
        Variant::App(balloon) => json!({
            "kind": "app",
            "app": custom_balloon_value(balloon),
        }),
        Variant::SharePlay => json!({ "kind": "shareplay" }),
        Variant::Vote => json!({ "kind": "poll_vote" }),
        Variant::PollUpdate => json!({ "kind": "poll_update" }),
        Variant::Unknown(code) => json!({ "kind": "unknown", "code": code }),
    }
}

fn custom_balloon_value(balloon: CustomBalloon<'_>) -> Value {
    match balloon {
        CustomBalloon::Application(bundle_id) => {
            json!({ "kind": "application", "bundle_id": bundle_id })
        }
        CustomBalloon::URL => json!({ "kind": "url" }),
        CustomBalloon::Handwriting => json!({ "kind": "handwriting" }),
        CustomBalloon::DigitalTouch => json!({ "kind": "digital_touch" }),
        CustomBalloon::ApplePay => json!({ "kind": "apple_pay" }),
        CustomBalloon::Fitness => json!({ "kind": "fitness" }),
        CustomBalloon::Slideshow => json!({ "kind": "slideshow" }),
        CustomBalloon::CheckIn => json!({ "kind": "check_in" }),
        CustomBalloon::FindMy => json!({ "kind": "find_my" }),
        CustomBalloon::Polls => json!({ "kind": "poll" }),
        CustomBalloon::Business => json!({ "kind": "business" }),
    }
}

fn tapback_action_value(action: TapbackAction) -> &'static str {
    match action {
        TapbackAction::Added => "added",
        TapbackAction::Removed => "removed",
    }
}

fn tapback_value(tapback: Tapback<'_>) -> Value {
    match tapback {
        Tapback::Loved => json!({ "kind": "loved" }),
        Tapback::Liked => json!({ "kind": "liked" }),
        Tapback::Disliked => json!({ "kind": "disliked" }),
        Tapback::Laughed => json!({ "kind": "laughed" }),
        Tapback::Emphasized => json!({ "kind": "emphasized" }),
        Tapback::Questioned => json!({ "kind": "questioned" }),
        Tapback::Emoji(emoji) => json!({ "kind": "emoji", "emoji": emoji }),
        Tapback::Sticker => json!({ "kind": "sticker" }),
    }
}

fn tapback_target_value(msg: &Message) -> Option<Value> {
    msg.clean_associated_guid().map(|(part_index, guid)| {
        json!({
            "message_guid": guid,
            "part_index": part_index,
        })
    })
}

fn expressive_value(expressive: Option<Expressive<'_>>) -> Option<Value> {
    expressive.map(|effect| {
        json!({
            "label": effect.to_string(),
            "debug": format!("{effect:?}"),
        })
    })
}

fn announcement_value(msg: &Message) -> Option<Value> {
    msg.group_action()
        .map(group_action_value)
        .or_else(|| {
            msg.is_fully_unsent()
                .then(|| json!({ "kind": "fully_unsent" }))
        })
        .or_else(|| {
            msg.is_kept_audio_message()
                .then(|| json!({ "kind": "audio_message_kept" }))
        })
}

fn attachment_meta_value(meta: &AttachmentMeta) -> Value {
    json!({
        "guid": meta.guid,
        "transcription": meta.transcription,
        "height": meta.height,
        "width": meta.width,
        "name": meta.name,
    })
}

fn attachment_lookup(attachments: &[Attachment]) -> HashMap<String, usize> {
    attachments
        .iter()
        .enumerate()
        .filter_map(|(idx, attachment)| attachment.guid.clone().map(|guid| (guid, idx)))
        .collect()
}

fn attachment_ranges_value(
    msg: &Message,
    attachment_lookup: &HashMap<String, usize>,
) -> Vec<Value> {
    msg.components
        .iter()
        .enumerate()
        .flat_map(|(part_index, part)| match part {
            BubbleComponent::Run(ranges) => ranges
                .iter()
                .filter_map(move |range| {
                    range.attachment.as_ref().map(|meta| {
                        let attachment_index = meta
                            .guid
                            .as_ref()
                            .and_then(|guid| attachment_lookup.get(guid).copied());
                        json!({
                            "part_index": part_index,
                            "range": range_bounds_value(range),
                            "emoji_image": range.emoji_image,
                            "metadata": attachment_meta_value(meta),
                            "attachment_index": attachment_index,
                        })
                    })
                })
                .collect::<Vec<_>>(),
            _ => vec![],
        })
        .collect()
}

fn range_bounds_value(range: &AttributedRange) -> Value {
    json!({
        "start": range.start,
        "end": range.end,
    })
}

fn group_action_value(action: GroupAction<'_>) -> Value {
    match action {
        GroupAction::ParticipantAdded(handle) => {
            json!({ "kind": "participant_added", "handle_id": handle })
        }
        GroupAction::ParticipantRemoved(handle) => {
            json!({ "kind": "participant_removed", "handle_id": handle })
        }
        GroupAction::NameChange(name) => json!({ "kind": "name_change", "name": name }),
        GroupAction::ParticipantLeft => json!({ "kind": "participant_left" }),
        GroupAction::GroupIconChanged => json!({ "kind": "group_icon_changed" }),
        GroupAction::GroupIconRemoved => json!({ "kind": "group_icon_removed" }),
        GroupAction::ChatBackgroundChanged => json!({ "kind": "chat_background_changed" }),
        GroupAction::ChatBackgroundRemoved => json!({ "kind": "chat_background_removed" }),
        GroupAction::PhoneNumberChanged(handle) => {
            json!({ "kind": "phone_number_changed", "handle_id": handle })
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        Config, JSONL, Options,
        app::{contacts::Name, export_type::ExportType},
    };
    use imessage_database::{
        message_types::text_effects::text_effect::TextEffect,
        tables::messages::models::{AttributedRange, BubbleComponent},
    };
    use serde_json::Value;

    #[test]
    fn can_create() {
        let options = Options::fake_options(ExportType::Jsonl);
        let config = Config::fake_app(options);
        let exporter = JSONL::new(&config).unwrap();
        assert_eq!(exporter.state.files.len(), 0);
    }

    #[test]
    fn can_export_basic_message_value() {
        let options = Options::fake_options(ExportType::Jsonl);
        let mut config = Config::fake_app(options);
        config.participants.insert(1, Name::fake_name("Alice"));
        config.real_participants.insert(1, 1);

        let exporter = JSONL::new(&config).unwrap();
        let mut message = Config::fake_message();
        message.guid = "message-guid".to_string();
        message.text = Some("Hello world".to_string());
        message.handle_id = Some(1);
        message.components = vec![BubbleComponent::Run(vec![AttributedRange::text(
            0,
            11,
            vec![TextEffect::Default],
        )])];

        let value = exporter.message_value(&mut message).unwrap();

        assert_eq!(value["schema"], "imessage-exporter.jsonl.v1");
        assert_eq!(value["guid"], "message-guid");
        assert_eq!(value["text"], "Hello world");
        assert_eq!(value["sender"]["display_name"], "Alice");
        assert_eq!(value["parts"][0]["segments"][0]["text"], "Hello world");
    }

    #[test]
    fn jsonl_lines_are_valid_json() {
        let options = Options::fake_options(ExportType::Jsonl);
        let config = Config::fake_app(options);
        let exporter = JSONL::new(&config).unwrap();
        let mut message = Config::fake_message();
        message.guid = "json-guid".to_string();
        message.text = Some("JSON says hi".to_string());
        message.components = vec![BubbleComponent::Run(vec![AttributedRange::text(
            0,
            12,
            vec![TextEffect::Default],
        )])];

        let value = exporter.message_value(&mut message).unwrap();
        let line = serde_json::to_string(&value).unwrap();
        let parsed: Value = serde_json::from_str(&line).unwrap();

        assert_eq!(parsed["guid"], "json-guid");
    }
}
