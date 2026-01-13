use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

pub fn list_input_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices: Vec<String> = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {}", e))?
        .filter_map(|d| d.name().ok())
        .collect();
    Ok(devices)
}

pub enum RecorderCommand {
    Start(Option<Sender<f32>>),
    Stop(Sender<Vec<f32>>),
}

pub struct AudioRecorder {
    command_tx: Sender<RecorderCommand>,
    sample_rate: u32,
    channels: u16,
}

impl AudioRecorder {
    pub fn new() -> Result<Self, String> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No input device available".to_string())?;

        let supported_config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input config: {}", e))?;

        let sample_rate = supported_config.sample_rate().0;
        let channels = supported_config.channels();
        let config: cpal::StreamConfig = supported_config.into();

        let (command_tx, command_rx): (Sender<RecorderCommand>, Receiver<RecorderCommand>) =
            channel();

        thread::spawn(move || {
            run_recorder_thread(device, config, command_rx);
        });

        Ok(Self {
            command_tx,
            sample_rate,
            channels,
        })
    }

    pub fn start_recording(&self, level_tx: Option<Sender<f32>>) -> Result<(), String> {
        self.command_tx
            .send(RecorderCommand::Start(level_tx))
            .map_err(|e| format!("Failed to send start command: {}", e))
    }

    pub fn stop_recording(&self) -> Result<Vec<f32>, String> {
        let (response_tx, response_rx) = channel();
        self.command_tx
            .send(RecorderCommand::Stop(response_tx))
            .map_err(|e| format!("Failed to send stop command: {}", e))?;

        response_rx
            .recv()
            .map_err(|e| format!("Failed to receive samples: {}", e))
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn channels(&self) -> u16 {
        self.channels
    }
}

fn run_recorder_thread(
    device: cpal::Device,
    config: cpal::StreamConfig,
    command_rx: Receiver<RecorderCommand>,
) {
    use parking_lot::Mutex;

    let samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let level_buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let last_emit: Arc<Mutex<Instant>> = Arc::new(Mutex::new(Instant::now()));
    let mut stream: Option<cpal::Stream> = None;
    let mut level_sender: Option<Sender<f32>> = None;

    loop {
        match command_rx.recv() {
            Ok(RecorderCommand::Start(level_tx)) => {
                samples.lock().clear();
                level_buffer.lock().clear();
                *last_emit.lock() = Instant::now();
                level_sender = level_tx;

                let samples_clone = Arc::clone(&samples);
                let level_buffer_clone = Arc::clone(&level_buffer);
                let last_emit_clone = Arc::clone(&last_emit);
                let level_tx_clone = level_sender.clone();
                let err_fn = |err| eprintln!("Audio stream error: {}", err);

                match device.build_input_stream(
                    &config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        samples_clone.lock().extend_from_slice(data);

                        if let Some(ref tx) = level_tx_clone {
                            level_buffer_clone.lock().extend_from_slice(data);

                            let mut last = last_emit_clone.lock();
                            if last.elapsed() >= Duration::from_millis(50) {
                                let mut buf = level_buffer_clone.lock();
                                if !buf.is_empty() {
                                    let rms = (buf.iter().map(|s| s * s).sum::<f32>() / buf.len() as f32).sqrt();
                                    let level = (rms * 25.0).min(1.0);
                                    let _ = tx.send(level);
                                    buf.clear();
                                }
                                *last = Instant::now();
                            }
                        }
                    },
                    err_fn,
                    None,
                ) {
                    Ok(s) => {
                        if let Err(e) = s.play() {
                            eprintln!("Failed to start stream: {}", e);
                        }
                        stream = Some(s);
                    }
                    Err(e) => {
                        eprintln!("Failed to build input stream: {}", e);
                    }
                }
            }
            Ok(RecorderCommand::Stop(response_tx)) => {
                drop(stream.take());
                level_sender = None;
                let recorded_samples = std::mem::take(&mut *samples.lock());
                let _ = response_tx.send(recorded_samples);
            }
            Err(_) => {
                break;
            }
        }
    }
}
