use flate2::read::GzDecoder;
use regex::Regex;
use std::fs::File;
use std::io::Read;
use std::path::Path;

// Ableton stores .als files as gzip-compressed XML; malformed files simply have no BPM.
pub fn get_project_bpm(als_path: &Path) -> Option<f64> {
    let file = File::open(als_path).ok()?;
    let mut decoder = GzDecoder::new(file);
    let mut xml = String::new();
    decoder.read_to_string(&mut xml).ok()?;

    let tempo_block = Regex::new(r"(?is)<Tempo(?:\s[^>]*)?>(.*?)</Tempo>").ok()?;
    let self_closing_tempo = Regex::new(r"(?is)<Tempo\b[^>]*/>").ok()?;
    let value_attr = Regex::new(r#"(?i)\bValue\s*=\s*["']([0-9]+(?:\.[0-9]+)?)['"]"#).ok()?;

    let block = tempo_block
        .find(&xml)
        .or_else(|| self_closing_tempo.find(&xml))?
        .as_str();
    let value = value_attr.captures(block)?.get(1)?.as_str();
    let bpm = value.parse::<f64>().ok()?;
    (bpm > 0.0).then_some(bpm)
}

#[cfg(test)]
mod tests {
    use super::get_project_bpm;
    use flate2::{write::GzEncoder, Compression};
    use std::io::Write;

    #[test]
    fn extracts_manual_tempo_from_gzipped_als_xml() {
        let temp_path = std::env::temp_dir().join("vertion-test-manual.als");
        let xml = r#"<Ableton><Tempo><Manual Value="128.000000" /></Tempo></Ableton>"#;
        let file = std::fs::File::create(&temp_path).unwrap();
        let mut encoder = GzEncoder::new(file, Compression::default());
        encoder.write_all(xml.as_bytes()).unwrap();
        encoder.finish().unwrap();

        assert_eq!(get_project_bpm(&temp_path), Some(128.0));
        let _ = std::fs::remove_file(temp_path);
    }
}
