module.exports = {

    obs: {
        host: "localhost", // `ws://${host}`
        port: 4455,
        password: "6hzHSBJSkq7KvEOS",

        PTZ_ACTION_DEVICE_ID: 1,

        OVERLAY_SCENENAME: "---OVERLAY---",
        PARENTS_OVERLAY_SOURCENAME: "parents_overlay",
        CUSTOM_OVERLAY_SOURCENAME: "custom_overlay",
        
        DEFAULT_OVERLAY_TIMEOUT_SECONDS: 300
    },

    camera: {
        CAMERA_IP: "192.168.32.107"  // `http://${config.CAMERA_IP}`
        
    },

    x32: {

        host: "192.168.56.1",
        port: 10023,
        localPort: 10024,

        pollIntervalMs: 10000,

        signals: {

            initialise:     { type: "snippet",  snippet: 10 },
            lecternOn:      { type: "snippet",  snippet: 13 },
            lecternLouder:  { type: "snippet",  snippet: 16 },
            bandSinging:    { type: "snippet",  snippet: 11 },
            bandSpeaking:   { type: "snippet",  snippet: 15 },
            bandSpeakLouder: { type: "snippet", snippet: 12 },

            muteSpeech:     { type: "toggle",   address: "/dca/5/on",       invert: true },
            muteBand:       { type: "toggle",   address: "/config/mute/6",  invert: false },

            testVolume:     { type: "fader",    address: "/ch/01/mix/fader" }
        }
    },

    ui: {
        // actions
        buttons: [
            { id: "btnInitialise",      signalId: "initialise",     label: "Initialise", confirm: true },
            { id: "btnLecternOn",       signalId: "lecternOn",      label: "Lectern On" },
            { id: "btnLecternLouder",   signalId: "lecternLouder",  label: "Lectern Louder" },
            { id: "btnBandSinging",     signalId: "bandSinging",    label: "Band Singing" },
            { id: "btnBandSpeaking",    signalId: "bandSpeaking",   label: "Band Speaking" },
            { id: "btnBandSpeakLouder", signalId: "bandSpeakLouder", label: "Band Speak Louder" },

            { id: "btnMuteSpeech",      signalId: "muteSpeech",     label: "Mute Speech" },
            { id: "btnMuteBand",        signalId: "muteBand",       label: "Mute Band" }
        ],

        // not actions
        indicators: [
            { id: "indSpeechMuted", signalId: "muteSpeech",     label: "Speech Muted" },
            { id: "indBandMuted",   signalId: "muteBand",       label: "Band Muted" }
        ],

        // not actions (not intended)
        faders: [
            { id: "fdrTest",        signalId: "testVolume",     label: "ch 1 test"}
        ],

        cameraPresets: [
            { PresetNumber: 2, PresetName: "Lectern" },
            { PresetNumber: 3, PresetName: "w/Lead" },
            { PresetNumber: 5, PresetName: "Band right" },
            { PresetNumber: 6, PresetName: "Band full" },
            { PresetNumber: 4, PresetName: "Drums" },
            { PresetNumber: 0, PresetName: "Home/cross" }
        ],

        DISABLE_SET_BUTTONS_AFTER_S: 30,    // how many seconds delay before disabling the SET button
        PRESETS_TABLE_MINIMUM_ROWS: 2              // suggest 2 rows.  e.g. show top 2 presets always

    }
};