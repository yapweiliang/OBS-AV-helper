module.exports = {

    x32: {
        host: "192.168.1.100",
        port: 10023
    },

    obs: {
        host: "localhost",
        port: 4455,
        password: ""
    },

    buttons: [

        {
            id: "initialise",
            label: "Initialise",
            confirm: true
        },

        {
            id: "lecternOn",
            label: "Lectern On"
        },

        {
            id: "lecternLouder",
            label: "Lectern Louder"
        },

        {
            id: "bandSinging",
            label: "Band Singing"
        },

        {
            id: "bandSpeaking",
            label: "Band Speaking"
        },

        {
            id: "bandSpeakLouder",
            label: "Band Speak Louder"
        },

        {
            id: "muteSpeech",
            label: "Mute Speech"
        },

        {
            id: "muteBand",
            label: "Mute Band"
        }
    ],

    actions: {

        initialise: {
            type: "snippet",
            snippet: 10
        },

        lecternOn: {
            type: "snippet",
            snippet: 13
            // obsScene: "Speaker"
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
            type: "toggleMute",
            address: "/dca/5/on"
        },

        muteBand: {
            type: "toggleMute",
            address: "/config/mute/6"
        }
    }
};