use std::process::ExitCode;

use imessage_exporter::{Options, app::options::from_command_line, run_with_options};

fn main() -> ExitCode {
    // Get args from command line
    let args = from_command_line();
    // Create application options
    let options = Options::from_args(&args);

    // Create app state and start
    match options {
        Ok(options) => match run_with_options(options) {
            Ok(()) => ExitCode::SUCCESS,
            Err(why) => {
                eprintln!("Unable to export: {why}");
                ExitCode::FAILURE
            }
        },
        Err(why) => {
            eprintln!("Invalid command line options: {why}");
            ExitCode::FAILURE
        }
    }
}
