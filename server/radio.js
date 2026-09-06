const path = require("path");
const fs = require("fs");

const RADIO_DIR = path.join(__dirname, "..", "public", "radio");

const SONG_FILES = [
  "Blind Willie McTell - I Got the Cross the River Jordan.flac",
  "Champion Jack Dupree - Junker's Blues.flac",
  "Johnny Shines - Travelling Back Home.flac",
  "Robert Johnson - Come On In My Kitchen.flac",
  "Furry Lewis - Judge Harsh Blues.flac",
  "Rev. Gary Davis - Samson And Delilah.flac",
  "John Lee Hooker - Boom Boom.flac",
  "Lightnin' Hopkins - What'd I Say_.flac",
  "John Lee Hooker - Boogie Chillen'.flac",
  "B.B. King - The Thrill Is Gone.flac",
  "Robert Johnson - Hell Hound On My Trail.flac",
  "Big Joe Williams - Baby Please Don't Go.flac",
  "Bobby Day - Rockin' Robin.flac",
  "Lightnin' Hopkins - Mojo Hand.flac",
  "Robert Petway - Catfish Blues.flac",
  "Louis Armstrong - St. James Infirmary (Gambler's Blues).flac",
  "Lee Dorsey - Working in the Coal Mine.flac",
  "Louis Armstrong - A Kiss to Build a Dream On.flac",
];

const FLAVOR_FILES = [
  "Recording.m4a",
  "Recording (2).m4a",
  "Recording (3).m4a",
  "Recording (4).m4a",
  "Recording (5).m4a",
  "Recording (6).m4a",
  "Recording (7).m4a",
  "Recording (8).m4a",
  "Recording (9).m4a",
  "Recording (10).m4a",
  "Recording (11).m4a",
  "Recording (12).m4a",
  "Recording (13).m4a",
  "Recording (14).m4a",
  "Recording (15).m4a",
  "Recording (16).m4a",
  "Recording (17).m4a",
  "Recording (18).m4a",
];

function listFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => !f.startsWith("."));
  } catch {
    return [];
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

class RadioStateMachine {
  constructor(io) {
    this.io = io;
    this.currentTrack = null;
    this.musicQueue = [];
    this.newsQueue = [];
    this.songsSinceNews = 0;
    this.blockTarget = this.randomBlockTarget();
    this.fallbackTimeout = null;
    this.started = false;
    this._pendingSong = null;
    this._recentSongs = [];
    this._cooldownSize = 14;

    this.newsFiles = listFiles(path.join(RADIO_DIR, "news"));
    this.transitionFiles = listFiles(path.join(RADIO_DIR, "news-transition"));
    this.newsEndFiles = listFiles(path.join(RADIO_DIR, "news-end"));
    this.flavorFiles = listFiles(path.join(RADIO_DIR, "flavor"));

    this.reshuffleMusic();
    this.reshuffleNews();

    console.log("[RADIO] Initialized. Waiting for client...");
  }

  clientReady() {
    if (!this.started) {
      this.started = true;
      console.log("[RADIO] Client ready, starting playback");
      this.next();
    }
  }

  randomBlockTarget() {
    return Math.floor(Math.random() * 2) + 2;
  }

  reshuffleMusic() {
    this.musicQueue = shuffle(SONG_FILES.map((f, i) => i));
  }

  pickSong() {
    const available = SONG_FILES.map((_, i) => i).filter(
      (i) => !this._recentSongs.includes(i)
    );
    const pool = available.length > 0 ? available : SONG_FILES.map((_, i) => i);
    const idx = pool[Math.floor(Math.random() * pool.length)];
    this._recentSongs.push(idx);
    if (this._recentSongs.length > this._cooldownSize) {
      this._recentSongs.shift();
    }
    return idx;
  }

  reshuffleNews() {
    this.newsQueue = shuffle([...this.newsFiles]);
  }

  clearFallback() {
    if (this.fallbackTimeout) {
      clearTimeout(this.fallbackTimeout);
      this.fallbackTimeout = null;
    }
  }

  play(type, title, filePath, fallbackSeconds) {
    this.clearFallback();
    this.currentTrack = { type, title, filePath };
    this.io.emit("radio:play", this.currentTrack);
    this.fallbackTimeout = setTimeout(() => {
      console.log(`[RADIO] Fallback fired for ${type}`);
      this.onTrackEnded();
    }, fallbackSeconds * 1000);
  }

  next() {
    if (this.songsSinceNews >= this.blockTarget) {
      this.songsSinceNews = 0;
      this.blockTarget = this.randomBlockTarget();
      this.startNewsSegment();
      return;
    }

    if (this.musicQueue.length === 0) this.reshuffleMusic();

    const songIndex = this.pickSong();
    const songFile = SONG_FILES[songIndex];
    const title = songFile.replace(".flac", "");
    const filePath = `/radio/music/${encodeURIComponent(songFile)}`;

    this._pendingSong = {
      type: "song",
      title,
      filePath,
      _songIndex: songIndex,
    };
    this.songsSinceNews++;

    // 30% chance the DJ introduces the song before it plays
    if (Math.random() < 0.3 && songIndex < FLAVOR_FILES.length) {
      this.playSongFlavor(songIndex);
      return;
    }

    this.playPendingSong();
  }

  playPendingSong() {
    const song = this._pendingSong;
    this._pendingSong = null;

    if (!song) {
      this.next();
      return;
    }

    this.currentTrack = song;
    this.clearFallback();
    this.io.emit("radio:play", this.currentTrack);
    this.fallbackTimeout = setTimeout(() => {
      console.log("[RADIO] Fallback fired for song");
      this.onTrackEnded();
    }, 240000);
  }

  startNewsSegment() {
    const file = pickRandom(this.transitionFiles);
    const filePath = `/radio/news-transition/${encodeURIComponent(file)}`;
    this._newsClipsRemaining = Math.floor(Math.random() * 2) + 1;
    this.play("news-transition", "Transição", filePath, 45);
  }

  playNewsClip() {
    if (this.newsQueue.length === 0) this.reshuffleNews();
    const file = this.newsQueue.pop();
    const filePath = `/radio/news/${encodeURIComponent(file)}`;
    this.play("news", "Notícias", filePath, 45);
  }

  playNewsEnd() {
    const file = pickRandom(this.newsEndFiles);
    const filePath = `/radio/news-end/${encodeURIComponent(file)}`;
    this.play("news-end", "Fim das Notícias", filePath, 45);
  }

  playFlavor() {
    const file = pickRandom(this.flavorFiles);
    const filePath = `/radio/flavor/${encodeURIComponent(file)}`;
    this.play("flavor", "Blues Man", filePath, 45);
  }

  playSongFlavor(songIndex) {
    if (songIndex < 0 || songIndex >= FLAVOR_FILES.length) {
      this.playPendingSong();
      return;
    }
    const file = FLAVOR_FILES[songIndex];
    const filePath = `/radio/music-flavor/${encodeURIComponent(file)}`;
    this.play("music-flavor", "Blues Man", filePath, 45);
  }

  onTrackEnded() {
    this.clearFallback();
    const prev = this.currentTrack;
    if (!prev) {
      this.next();
      return;
    }

    console.log(`[RADIO] Track ended: ${prev.type} — ${prev.title}`);

    switch (prev.type) {
      case "song": {
        if (Math.random() < 0.15) {
          this.playFlavor();
          return;
        }
        this.next();
        break;
      }

      case "music-flavor": {
        // The DJ just introduced a song — play it now.
        this.playPendingSong();
        break;
      }

      case "flavor": {
        this.next();
        break;
      }

      case "news-transition": {
        if (this._newsClipsRemaining > 0) {
          this._newsClipsRemaining--;
          this.playNewsClip();
        } else {
          this.playNewsEnd();
        }
        break;
      }

      case "news": {
        if (this._newsClipsRemaining > 0) {
          this._newsClipsRemaining--;
          this.playNewsClip();
        } else {
          this.playNewsEnd();
        }
        break;
      }

      case "news-end": {
        this.next();
        break;
      }

      default: {
        this.next();
      }
    }
  }

  getState() {
    return this.currentTrack ? { ...this.currentTrack } : null;
  }
}

module.exports = { RadioStateMachine };
