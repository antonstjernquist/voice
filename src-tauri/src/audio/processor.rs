const WHISPER_SAMPLE_RATE: u32 = 16000;

pub fn convert_to_whisper_format(
    samples: Vec<f32>,
    source_sample_rate: u32,
    source_channels: u16,
) -> Vec<f32> {
    let mono_samples = if source_channels > 1 {
        convert_to_mono(&samples, source_channels as usize)
    } else {
        samples
    };

    if source_sample_rate != WHISPER_SAMPLE_RATE {
        resample(&mono_samples, source_sample_rate, WHISPER_SAMPLE_RATE)
    } else {
        mono_samples
    }
}

fn convert_to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    samples
        .chunks(channels)
        .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
        .collect()
}

fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    let ratio = to_rate as f64 / from_rate as f64;
    let new_len = (samples.len() as f64 * ratio) as usize;
    let mut resampled = Vec::with_capacity(new_len);

    for i in 0..new_len {
        let src_idx = i as f64 / ratio;
        let idx_floor = src_idx.floor() as usize;
        let idx_ceil = (idx_floor + 1).min(samples.len() - 1);
        let frac = src_idx - idx_floor as f64;

        let sample = samples[idx_floor] * (1.0 - frac as f32) + samples[idx_ceil] * frac as f32;
        resampled.push(sample);
    }

    resampled
}
