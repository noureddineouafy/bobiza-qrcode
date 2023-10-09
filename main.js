const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const cfonts = require("cfonts")


const NodeCache = require("node-cache");
const readline = require("readline");

const usePairingCode = true;
const useMobile = false;
const useStore = false;

const MAIN_LOGGER = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` });


const logger = MAIN_LOGGER.child({});
logger.level = "trace";

const store = useStore ? makeInMemoryStore({ logger }) : undefined;
store?.readFromFile("./session");

// Save every 1m
setInterval(() => {
    store?.writeToFile("./session");
}, 10000 * 6);

const msgRetryCounterCache = new NodeCache();
const { say } = cfonts;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const P = require("pino")({
    level: "silent",
});
const stores = makeInMemoryStore({

    logger: pino().child({ level: "silent", stream: "store" }),

});

say("BOBIZA MD", {
    font: "tiny",
    align: "left",
    colors: ["#ff8000"],
});

say("Get your session ID by entering your WhatsApp number below:", {
    font: "console",
    align: "left",
    colors: ["red"],
});



async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')

    async function qr() {

        let { version } = await fetchLatestBaileysVersion();

        const GURU = makeWASocket({
            version,
            logger: P,
            printQRInTerminal: !usePairingCode,
            mobile: useMobile,
            browser: ["chrome (linux)", "", ""],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P),
            },
            msgRetryCounterCache,
            getMessage: async (key) => {
                if(store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg.message || undefined;
                }
            },
        });

        store?.bind(GURU.ev);

        if (usePairingCode && !GURU.authState.creds.registered) {
            if (useMobile) {
                throw new Error("Cannot use pairing code with mobile api");
            }

            const phoneNumber = await question(
                "\x1b[33mPlease enter your WhatsApp number without the plus sign, for example, 917788861856:\n\x1b[0m"
            );
            const code = await GURU.requestPairingCode(phoneNumber);
            console.log("\x1b[36mPairing code: \x1b[32m" + code, "\x1b[0m");

        }
        GURU.ev.on("connection.update", async (s) => {
            const { connection, lastDisconnect } = s
            if (connection == "open") {

                let botsession = fs.readFileSync('./session/creds.json')
                await delay(1000 * 2)
                const session = await GURU.sendMessage(GURU.user.id, { document: botsession, mimetype: `application/json`, fileName: `creds.json` })
                const msgf = `Hello there! 👋 \n\nDo not share your session File with anyone.\n\nupload the creds.json file in session folder\n\nBOBIZA MD`
                await GURU.sendMessage(GURU.user.id, { text: msgf }, {quoted: session});
                await delay(1000 * 10)

                process.exit(0)
            }
            if (
                connection === "close" &&
                lastDisconnect &&
                lastDisconnect.error &&
                lastDisconnect.error.output.statusCode != 401
            ) {
                qr()
            }
        })
        GURU.ev.on('creds.update', saveCreds)
        GURU.ev.on('messages.upsert', () => { })
    }
    qr()
}
connect()