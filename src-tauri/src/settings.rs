use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub top: bool,
    pub keyboard: bool,
    pub sound: bool,
    pub key_sound: bool,
    pub focus_mode: bool,
    pub standby_mode: bool,
    pub volume: f64,
    pub size: String,
    pub scale: f64,
    pub dock: String,
    pub view: String,
    pub keyboard_style: String,
    pub theme: String,
    pub coat: String,
    pub eye_color: String,
    pub accessory: String,
    pub accessory_color: String,
    pub christmas_decor: bool,
    pub sleep_minutes: u32,
    pub left_mouse: bool,
    pub numpad: bool,
    pub show_key_chips: bool,
    pub privacy_mode: bool,
    pub click_through: bool,
    pub focus_minutes: u32,
    pub break_minutes: u32,
    pub hide_on_close: bool,
    pub position: Option<Position>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            top: true,
            keyboard: true,
            sound: true,
            key_sound: true,
            focus_mode: false,
            standby_mode: false,
            volume: 0.7,
            size: "medium".into(),
            scale: 1.0,
            dock: "right".into(),
            view: "cat".into(),
            keyboard_style: "cream".into(),
            theme: "cream".into(),
            coat: "solidblack".into(),
            eye_color: "auto".into(),
            accessory: "crown".into(),
            accessory_color: "auto".into(),
            christmas_decor: true,
            sleep_minutes: 5,
            left_mouse: false,
            numpad: false,
            show_key_chips: true,
            privacy_mode: false,
            click_through: false,
            focus_minutes: 25,
            break_minutes: 5,
            hide_on_close: true,
            position: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stats {
    pub date: String,
    pub keys: u64,
    pub clicks: u64,
}

impl Stats {
    pub fn today() -> Self {
        Self {
            date: local_date(),
            keys: 0,
            clicks: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroState {
    pub phase: String,
    pub paused: bool,
    pub remaining_sec: u32,
    pub rounds: u32,
}

impl PomodoroState {
    pub fn new(focus_minutes: u32) -> Self {
        Self {
            phase: "idle".into(),
            paused: false,
            remaining_sec: focus_minutes.max(1) * 60,
            rounds: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuStateSnapshot {
    pub prefs: Preferences,
    pub stats: Stats,
    pub pomodoro: PomodoroState,
    pub listening: bool,
    pub visible: bool,
    pub unavailable_reason: String,
    pub version: String,
    pub wayland_session: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct PersistedFile {
    #[serde(default)]
    prefs: Preferences,
    stats: Option<Stats>,
}

pub fn local_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

pub struct SettingsStore {
    file: PathBuf,
    pub prefs: Preferences,
    pub stats: Stats,
}

impl SettingsStore {
    pub fn load(dir: &Path) -> Self {
        let file = dir.join("preferences.json");
        let mut prefs = Preferences::default();
        let mut stats = Stats::today();

        if let Ok(raw) = fs::read_to_string(&file) {
            if let Ok(parsed) = serde_json::from_str::<PersistedFile>(&raw) {
                prefs = sanitize_prefs(parsed.prefs);
                if let Some(s) = parsed.stats {
                    if s.date == local_date() {
                        stats = s;
                    }
                }
            }
        }

        let mut store = Self { file, prefs, stats };
        store.rollover();
        store
    }

    pub fn rollover(&mut self) {
        let today = local_date();
        if self.stats.date != today {
            self.stats = Stats {
                date: today,
                keys: 0,
                clicks: 0,
            };
        }
    }

    pub fn count(&mut self, kind: &str) {
        self.rollover();
        match kind {
            "keys" => self.stats.keys = self.stats.keys.saturating_add(1),
            "clicks" => self.stats.clicks = self.stats.clicks.saturating_add(1),
            _ => return,
        }
        self.flush();
    }

    pub fn set_value(&mut self, key: &str, value: Value) -> bool {
        let updated = match key {
            "top" => value.as_bool().map(|v| self.prefs.top = v).is_some(),
            "keyboard" => value.as_bool().map(|v| self.prefs.keyboard = v).is_some(),
            "sound" => value.as_bool().map(|v| self.prefs.sound = v).is_some(),
            "keySound" => value.as_bool().map(|v| self.prefs.key_sound = v).is_some(),
            "focusMode" => value.as_bool().map(|v| self.prefs.focus_mode = v).is_some(),
            "standbyMode" => value.as_bool().map(|v| self.prefs.standby_mode = v).is_some(),
            "leftMouse" => value.as_bool().map(|v| self.prefs.left_mouse = v).is_some(),
            "numpad" => value.as_bool().map(|v| self.prefs.numpad = v).is_some(),
            "showKeyChips" => value.as_bool().map(|v| self.prefs.show_key_chips = v).is_some(),
            "privacyMode" => value.as_bool().map(|v| self.prefs.privacy_mode = v).is_some(),
            "clickThrough" => value.as_bool().map(|v| self.prefs.click_through = v).is_some(),
            "hideOnClose" => value.as_bool().map(|v| self.prefs.hide_on_close = v).is_some(),
            "christmasDecor" => value.as_bool().map(|v| self.prefs.christmas_decor = v).is_some(),
            "volume" => value
                .as_f64()
                .filter(|v| v.is_finite() && *v >= 0.0 && *v <= 1.0)
                .map(|v| self.prefs.volume = v)
                .is_some(),
            "scale" => value
                .as_f64()
                .filter(|v| v.is_finite() && *v >= 0.75 && *v <= 1.5)
                .map(|v| self.prefs.scale = v)
                .is_some(),
            "focusMinutes" => value
                .as_u64()
                .filter(|v| *v >= 1 && *v <= 120)
                .map(|v| self.prefs.focus_minutes = v as u32)
                .is_some(),
            "breakMinutes" => value
                .as_u64()
                .filter(|v| *v >= 1 && *v <= 60)
                .map(|v| self.prefs.break_minutes = v as u32)
                .is_some(),
            "sleepMinutes" => value
                .as_u64()
                .filter(|v| matches!(*v, 2 | 5 | 10))
                .map(|v| self.prefs.sleep_minutes = v as u32)
                .is_some(),
            "size" => value
                .as_str()
                .filter(|v| matches!(*v, "small" | "medium" | "large"))
                .map(|v| {
                    self.prefs.size = v.into();
                    self.prefs.scale = match v {
                        "small" => 0.76,
                        "large" => 1.26,
                        _ => 1.0,
                    };
                })
                .is_some(),
            "dock" => value
                .as_str()
                .filter(|v| matches!(*v, "left" | "right"))
                .map(|v| self.prefs.dock = v.into())
                .is_some(),
            "view" => value
                .as_str()
                .filter(|v| matches!(*v, "cat" | "mirror"))
                .map(|v| self.prefs.view = v.into())
                .is_some(),
            "keyboardStyle" => value
                .as_str()
                .filter(|v| matches!(*v, "cream" | "matcha" | "sakura" | "obsidian"))
                .map(|v| self.prefs.keyboard_style = v.into())
                .is_some(),
            "theme" => value
                .as_str()
                .filter(|v| matches!(*v, "cream" | "mint" | "night" | "green"))
                .map(|v| self.prefs.theme = v.into())
                .is_some(),
            "coat" => value
                .as_str()
                .filter(|v| {
                    matches!(
                        *v,
                        "solidblack"
                            | "maotao"
                            | "calico"
                            | "ragdoll"
                            | "orange"
                            | "black"
                            | "siamese"
                            | "white"
                    )
                })
                .map(|v| self.prefs.coat = v.into())
                .is_some(),
            "eyeColor" => value
                .as_str()
                .filter(|v| {
                    matches!(
                        *v,
                        "auto" | "blue" | "amber" | "emerald" | "violet" | "rose" | "odd"
                    )
                })
                .map(|v| self.prefs.eye_color = v.into())
                .is_some(),
            "accessory" => value
                .as_str()
                .filter(|v| {
                    matches!(
                        *v,
                        "none"
                            | "crown"
                            | "headphones"
                            | "retro"
                            | "bell"
                            | "fish"
                            | "scarf"
                            | "wizard"
                            | "star"
                            | "shades"
                            | "beret"
                            | "sprout"
                            | "halo"
                            | "dizzy"
                    )
                })
                .map(|v| self.prefs.accessory = v.into())
                .is_some(),
            "accessoryColor" => value
                .as_str()
                .filter(|v| {
                    matches!(
                        *v,
                        "auto" | "sage" | "obsidian" | "cream" | "caramel" | "mist" | "sakura"
                    )
                })
                .map(|v| self.prefs.accessory_color = v.into())
                .is_some(),
            "position" => {
                if value.is_null() {
                    self.prefs.position = None;
                    true
                } else if let (Some(x), Some(y)) = (
                    value.get("x").and_then(|v| v.as_i64()),
                    value.get("y").and_then(|v| v.as_i64()),
                ) {
                    if x.abs() < 100_000 && y.abs() < 100_000 {
                        self.prefs.position = Some(Position {
                            x: x as i32,
                            y: y as i32,
                        });
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            _ => false,
        };
        if updated {
            self.flush();
        }
        updated
    }

    pub fn flush(&self) {
        if let Some(parent) = self.file.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let payload = PersistedFile {
            prefs: self.prefs.clone(),
            stats: Some(self.stats.clone()),
        };
        if let Ok(json) = serde_json::to_string_pretty(&payload) {
            let tmp = self.file.with_extension("json.tmp");
            if fs::write(&tmp, json).is_ok() {
                let _ = fs::rename(&tmp, &self.file);
            }
        }
    }
}

fn sanitize_prefs(mut p: Preferences) -> Preferences {
    let d = Preferences::default();
    if !p.volume.is_finite() || p.volume < 0.0 || p.volume > 1.0 {
        p.volume = d.volume;
    }
    if !p.scale.is_finite() || p.scale < 0.75 || p.scale > 1.5 {
        p.scale = d.scale;
    }
    if p.focus_minutes < 1 || p.focus_minutes > 120 {
        p.focus_minutes = d.focus_minutes;
    }
    if p.break_minutes < 1 || p.break_minutes > 60 {
        p.break_minutes = d.break_minutes;
    }
    if !matches!(p.sleep_minutes, 2 | 5 | 10) {
        p.sleep_minutes = d.sleep_minutes;
    }
    p
}
