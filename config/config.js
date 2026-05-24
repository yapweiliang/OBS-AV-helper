module.exports = {

    x32: {

        //host: "192.168.22.138",
        host: "192.168.56.1",
        port: 10023,
        localPort: 10024,

        pollIntervalMs: 10000,

        actions: {

            initialise: {
                type: "snippet",
                snippet: 10
            },

            lecternOn: {
                type: "snippet",
                snippet: 13
            },

            lecternLouder: {
                type: "snippet",
                snippet: 16
            },

            bandSinging: {
                type: "snippet",
                snippet: 11
            },

            bandSpeaking: {
                type: "snippet",
                snippet: 15
            },

            bandSpeakLouder: {
                type: "snippet",
                snippet: 12
            },

            muteSpeech: {
                type: "toggle",
                address: "/dca/5/on",
                invertState: true,
                poll: true
            },

            muteBand: {
                type: "toggle",
                address: "/config/mute/6",
                invertState: false,
                poll: true
            }
        }
    },

    buttons: [

        {
            id: "btnInitialise",
            label: "Initialise",
            action: "initialise",
            confirm: true
        },

        {
            id: "btnLecternOn",
            label: "Lectern On",
            action: "lecternOn"
        },

        {
            id: "btnLecternLouder",
            label: "Lectern Louder",
            action: "lecternLouder"
        },

        {
            id: "btnBandSinging",
            label: "Band Singing",
            action: "bandSinging"
        },

        {
            id: "btnBandSpeaking",
            label: "Band Speaking",
            action: "bandSpeaking"
        },

        {
            id: "btnBandSpeakLouder",
            label: "Band Speak Louder",
            action: "bandSpeakLouder"
        },

        {
            id: "btnMuteSpeech",
            label: "Mute Speech",
            action: "muteSpeech"
        },

        {
            id: "btnMuteBand",
            label: "Mute Band",
            action: "muteBand"
        }
    ]
};