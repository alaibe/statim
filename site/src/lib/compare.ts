export type Fact =
  | 'signUp'
  | 'encryption'
  | 'servers'
  | 'openSource'
  | 'networks'
  | 'wallet'
  | 'calls'
  | 'platforms';

export const factLabels: Record<Fact, string> = {
  signUp: 'To sign up',
  encryption: 'End-to-end encryption',
  servers: 'Who runs the servers',
  openSource: 'Open source',
  networks: 'Other networks',
  wallet: 'Wallet',
  calls: 'Voice and video calls',
  platforms: 'Platforms',
};

export type Glance = 'signUp' | 'encrypted' | 'openSource' | 'ownServer' | 'wallet' | 'calls';

export const glanceLabels: Record<Glance, string> = {
  signUp: 'Sign up with',
  encrypted: 'Encrypted by default',
  openSource: 'Open source',
  ownServer: 'Your own server',
  wallet: 'Wallet',
  calls: 'Calls',
};

export interface Comparison {
  id: string;
  name: string;
  title: string;
  description: string;
  summary: string;
  lead: string;
  glance: Record<Glance, string>;
  facts: Record<Fact, string>;
  sections: Array<{ heading: string; paragraphs: Array<string> }>;
  pickStatim: Array<string>;
  pickOther: Array<string>;
  guide: Array<{ title: string; href: string }>;
  sources: Array<{ title: string; href: string }>;
}

export const checked = '2026-10-28';

export const statim: Pick<Comparison, 'glance' | 'facts'> = {
  glance: {
    signUp: 'Nothing',
    encrypted: 'On XMTP, Nostr and Status',
    openSource: 'Yes, MIT',
    ownServer: 'Nostr, Status, Matrix',
    wallet: 'Yes, off by default',
    calls: 'No',
  },
  facts: {
    signUp:
      'Nothing. The app makes twelve words on your device, and they are your account. No phone number, no email.',
    encryption:
      "Always on XMTP, Nostr and Status. On Matrix, in chats with encryption on. Telegram chats are not end-to-end encrypted, same as in Telegram's own app.",
    servers:
      "Each protocol's own nodes, relays and homeservers. The developer runs none of them. You can point the app at your own Nostr relays, Status node or Matrix homeserver.",
    openSource: 'The whole app, MIT licence.',
    networks:
      'XMTP, Nostr, Status, Telegram and Matrix in one chat list. WhatsApp, Signal, Slack, Discord and others through a Matrix bridge you run.',
    wallet:
      'Ethereum and its chains, Bitcoin and Solana, from the same twelve words. A plugin, off until you turn it on. Ledger, Trezor and Keystone work too.',
    calls: 'None.',
    platforms:
      'macOS, Windows and Linux. iPhone in beta on TestFlight, Android in open testing on Google Play.',
  },
};

export const comparisons: Array<Comparison> = [
  {
    id: 'status',
    name: 'Status',
    title: 'Statim vs Status: two apps on the same chat protocol',
    description:
      "Statim speaks Status's chat protocol, so the two apps can talk. How they differ on Communities, the wallet, other protocols and who runs the nodes.",
    summary:
      'Same chat protocol, same recovery phrase. Status has Communities; Statim adds four more protocols.',
    lead: "Statim speaks Status's own chat protocol, so a Statim user and a Status user can share DMs and groups. Statim took its logo from the 2018 Status app, but it is a separate project, not affiliated with or endorsed by Status. The two apps differ in what surrounds the chat.",
    glance: {
      signUp: 'Nothing',
      encrypted: 'Yes, except public Communities',
      openSource: 'Yes, MPL 2.0',
      ownServer: 'No',
      wallet: 'Yes',
      calls: 'No',
    },
    facts: {
      signUp:
        'Nothing. A recovery phrase made on your device, or a Keycard, plus a password that cannot be recovered.',
      encryption:
        'DMs and group chats, with keys that change on every message. A Community can be private and encrypted, or public and not.',
      servers:
        "The Waku network. Every Status app takes part, and Status runs nodes that hold undelivered messages for up to 30 days. The app picks between Status's own fleets.",
      openSource: 'The app and status-go, its backend, under MPL 2.0.',
      networks: 'None. Status is its own network.',
      wallet:
        'Built in, for Ethereum, Arbitrum, Optimism, Base and a growing list of other layer 2 chains. Keycard as a hardware wallet.',
      calls: 'None.',
      platforms: 'iPhone, Android, macOS on Apple silicon, Windows and Linux.',
    },
    sections: [
      {
        heading: 'The same chat, from either app',
        paragraphs: [
          'Statim derives your Status identity from the recovery phrase the same way Status does. Import the phrase you use in Status and you are the same person in both apps, with the same `zQ3sh…` chat key. Status users add you by that key or by a `status.app` link, and your first message to them arrives as a contact request.',
          'DMs and groups work in both directions: replies, mentions, reactions, photos, voice notes, edits and deletions. Status stickers show in Statim as a line saying what they were, and this protocol has no polls or pins in Statim.',
          "Running the same phrase in both apps at once works, with a catch. The two apps do not share history, and a contact's messages reach Statim only after Statim has written to them. Most people pick one app for their Status chats.",
        ],
      },
      {
        heading: 'What Status has that Statim does not',
        paragraphs: [
          "Status is built around Communities: channels that can be gated by token, a directory curated with SNT, and an owner whose desktop app acts as the Community's control node. Statim does not open Communities at all.",
          "Status also makes a profile straight from a Keycard, and its wallet covers more Ethereum layer 2 chains than Statim's. Neither app has voice or video calls.",
        ],
      },
      {
        heading: 'What Statim adds',
        paragraphs: [
          'Statim puts Status next to XMTP, Nostr, Telegram and Matrix in one chat list, so a Status DM sits beside a Telegram group and a WhatsApp chat bridged through Matrix. Each chat says which protocol it is on and what that protocol protects.',
          'Its wallet holds Bitcoin and Solana as well as Ethereum, Base, Optimism, Arbitrum and Polygon, and signs with a Ledger, Trezor or Keystone. It is a plugin, off on a fresh install. On a computer, the `statim` command reads and sends messages from a terminal, for you or an AI assistant you let use it.',
        ],
      },
      {
        heading: 'Encryption and nodes',
        paragraphs: [
          "Both apps reach the network through Status's nodes by default, and those nodes see your network address and which topics you follow, never what the messages say. In Statim you can enter a node you run instead. The Status app chooses between Status's own fleets.",
          'One difference in Statim: your first message to someone is encrypted to their chat key with a one-off key, so it has no forward secrecy. Once their Status app replies, both sides move to a Double Ratchet, as the Status app does from the start.',
        ],
      },
    ],
    pickStatim: [
      'You want your Status DMs in the same list as Telegram, Matrix, XMTP and Nostr.',
      'You want a wallet that also holds Bitcoin and Solana, or signs with a Ledger or Trezor.',
      'You want to reach the Status network through a node you run.',
      'You want a command line, or an AI assistant, to work with your messages.',
    ],
    pickOther: [
      'You spend your time in Status Communities.',
      "You use a Keycard, or want the wallet's longer list of layer 2 chains.",
      'Status is the only network you need, and you want the app its own team builds.',
    ],
    guide: [
      { title: 'Protocols: Status', href: '/guide/networks#status' },
      { title: 'Your account', href: '/guide/account' },
      { title: 'Wallet', href: '/guide/wallet' },
    ],
    sources: [
      {
        title: 'About Status messages',
        href: 'https://status.app/help/messaging/about-status-messages',
      },
      { title: 'Status messages FAQ', href: 'https://status.app/help/messaging/messages-faq' },
      {
        title: 'The control node in Status Communities',
        href: 'https://status.app/help/communities/about-the-control-node-in-status-communities',
      },
      {
        title: 'Layer 2 networks in the Status wallet',
        href: 'https://status.app/help/wallet/lower-your-fees-with-layer-2-networks',
      },
      { title: 'status-im/status-app on GitHub', href: 'https://github.com/status-im/status-app' },
    ],
  },
  {
    id: 'signal',
    name: 'Signal',
    title: 'Statim vs Signal: a phone number or twelve words',
    description:
      'Signal needs a phone number and runs as one service; Statim needs nothing and joins five protocols. How they compare on encryption, metadata, calls and more.',
    summary:
      'Signal has calls and a long record on privacy. Statim needs no phone number and joins five protocols.',
    lead: 'Signal encrypts every chat and call by default, and answers subpoenas with little more than the date an account was created. It needs a phone number to register and runs as one service. Statim needs nothing to sign up and puts several protocols in one chat list, though it cannot message a Signal user directly.',
    glance: {
      signUp: 'Phone number',
      encrypted: 'Yes',
      openSource: 'Yes, AGPL 3.0',
      ownServer: 'No',
      wallet: 'MobileCoin',
      calls: 'Yes, group',
    },
    facts: {
      signUp:
        'A phone number. An optional username lets people reach you without it, but you cannot register without one.',
      encryption: 'Every chat and call, with the Signal Protocol and a post-quantum key exchange.',
      servers: "Signal runs every server, and the official apps connect only to Signal's.",
      openSource: 'The apps, the server and libsignal, under AGPL 3.0.',
      networks: 'None.',
      wallet: 'MobileCoin payments, not offered in every country.',
      calls: '1:1 voice and video, and group calls of up to 75 people.',
      platforms: 'iPhone, Android, Windows, macOS and Linux. The computer app links to your phone.',
    },
    sections: [
      {
        heading: 'Phone number or twelve words',
        paragraphs: [
          'Signal registers you with a phone number. The number is hidden by default, and an optional username lets people reach you without it, but the account still exists through that number. Your phone is the main device, with up to five linked ones.',
          'Statim registers nothing. The app makes twelve words on your device, and people reach you by an Ethereum address or ENS name on XMTP, an `npub…` key on Nostr, or a `zQ3sh…` chat key on Status. The same words run the account on a phone and a computer, with neither one in charge.',
        ],
      },
      {
        heading: 'Encryption and metadata',
        paragraphs: [
          "Signal encrypts everything by default and has added a post-quantum key exchange. Sealed sender hides who sent a message from Signal's own servers, and the server keeps no record of who is in a group. Its published subpoena answers contain only when an account registered and when it last connected.",
          "Statim's encryption is the protocol's. XMTP uses MLS, Nostr seals DMs so relays never learn the sender, Status uses its own scheme, and Matrix uses Olm and Megolm in chats with encryption on. Telegram chats are not end-to-end encrypted, in Statim or in Telegram's own app. Every chat says which applies.",
        ],
      },
      {
        heading: 'One service or several',
        paragraphs: [
          "Signal Messenger LLC, part of the nonprofit Signal Technology Foundation, runs every server. The server code is published, but the official apps connect only to Signal's own.",
          "Statim's developer runs no server. Each protocol has its own nodes, relays or homeservers, and for Nostr, Status and Matrix you can use ones you run.",
        ],
      },
      {
        heading: 'Reaching Signal users from Statim',
        paragraphs: [
          "Statim has no Signal code, and Signal offers no way for another app to join its network. What works is a Matrix bridge: mautrix-signal links to your Signal account as a device, the way Signal Desktop does, and turns your Signal chats into Matrix chats Statim shows. Statim's desktop app can [run that bridge on your computer](/guide/computer-matrix).",
          "The bridge decrypts your Signal messages on the machine where it runs, so Signal's end-to-end encryption stops there. Put it somewhere you trust as much as your phone, or keep Signal for the chats where that matters.",
        ],
      },
    ],
    pickStatim: [
      'You do not want to give anyone a phone number.',
      'You want Telegram, Matrix, XMTP, Nostr and Status chats in one list.',
      'You want a self-custody wallet for Ethereum, Bitcoin and Solana in the chat.',
      'You want a command line, or an AI assistant, to read and send for you.',
    ],
    pickOther: [
      'You need voice and video calls, including group calls.',
      'The people you talk to are on Signal.',
      'You want the tightest limits on metadata, from a service with a long public record.',
      "You want an app that is out of beta on every platform. Statim's phone apps are still in beta.",
    ],
    guide: [
      { title: 'WhatsApp, Signal & friends', href: '/guide/bridges' },
      { title: 'Matrix on your computer', href: '/guide/computer-matrix' },
      { title: 'Protocols at a glance', href: '/guide/networks#at-a-glance' },
    ],
    sources: [
      {
        title: 'Phone number privacy and usernames',
        href: 'https://signal.org/blog/phone-number-privacy-usernames/',
      },
      { title: 'Government requests to Signal', href: 'https://signal.org/bigbrother/' },
      { title: 'Sealed sender', href: 'https://signal.org/blog/sealed-sender/' },
      { title: 'Signal and post-quantum ratchets', href: 'https://signal.org/blog/spqr/' },
      {
        title: 'Group calls',
        href: 'https://support.signal.org/hc/en-us/articles/360052977792',
      },
      { title: 'Signal on GitHub', href: 'https://github.com/signalapp' },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    title: 'Statim vs Telegram: keep Telegram, add encrypted chats',
    description:
      "Statim is also a Telegram client. What you keep and lose by reading Telegram in Statim, and how Telegram's encryption compares with Statim's other protocols.",
    summary:
      'Statim is also a Telegram client: your Telegram chats, next to encrypted XMTP, Nostr and Status ones.',
    lead: 'Statim is a Telegram client as well as a messenger of its own. Sign in with your Telegram account and your DMs, groups and channels sit in the same chat list as your XMTP, Nostr, Status and Matrix chats. What changes is where you read Telegram, and what sits beside it.',
    glance: {
      signUp: 'Phone number',
      encrypted: 'No, Secret Chats only',
      openSource: 'Apps only',
      ownServer: 'No',
      wallet: 'Stars, TON',
      calls: 'Yes, group',
    },
    facts: {
      signUp:
        'A phone number, which can be an anonymous number bought on Fragment instead of a SIM.',
      encryption:
        'Not by default. Ordinary chats, groups and channels are encrypted only between you and Telegram. Secret Chats are end to end, 1:1 and on one device. Calls are end to end.',
      servers:
        'Telegram runs every server, and the server code is not published. Other apps connect with an API ID their developer registers.',
      openSource: 'The apps, under GPL. The server is closed.',
      networks: 'None.',
      wallet: 'Stars for digital goods, and a built-in TON wallet rolling out to some users.',
      calls: 'Voice and video, and group calls of up to 200 people.',
      platforms: 'iPhone, Android, Windows, macOS, Linux, the web and watches.',
    },
    sections: [
      {
        heading: 'Telegram inside Statim',
        paragraphs: [
          "Statim runs TDLib, Telegram's own client library, with an API ID you register yourself at [my.telegram.org](https://my.telegram.org). You sign in with your phone number and the code Telegram sends, and Statim shows up in Telegram's Active Sessions like any other app.",
          "Most of Telegram comes along: replies, reactions, photos, video, files and voice notes, edits and deletions, pins, polls, search across Telegram's own history, mentions, typing and last seen. You can join public groups and channels from a link, and administrators can make invite links, approve join requests, set slow mode and ban members. Drafts and chats marked unread follow you to your other Telegram apps.",
        ],
      },
      {
        heading: "What stays in Telegram's own app",
        paragraphs: [
          'Statim does not open Secret Chats and has no calls. Stories, Mini Apps and the TON wallet are not in Statim either. If you use those, keep Telegram installed for them; your chats stay in sync between the two.',
        ],
      },
      {
        heading: 'Encryption',
        paragraphs: [
          "Telegram's ordinary chats, every group and every channel are encrypted between you and Telegram's servers, which store them and can read them. Telegram's privacy policy says a valid court order about a criminal suspect can release your IP address and phone number. Secret Chats are end to end but 1:1 and tied to one device, and calls are end to end too.",
          'Statim marks every Telegram chat as not end-to-end encrypted. Its own protocols work differently: XMTP, Nostr and Status chats are always end-to-end encrypted, and none of them needs a phone number.',
        ],
      },
      {
        heading: 'Using both',
        paragraphs: [
          'If you keep Telegram for the groups and channels you follow, Statim lets you read them next to private chats on protocols Telegram cannot see into. If Telegram is all you use, its own app does more of it.',
        ],
      },
    ],
    pickStatim: [
      'You want Telegram next to end-to-end encrypted chats, in one list.',
      'You want encrypted DMs without giving anyone a phone number.',
      'You want a self-custody wallet for Ethereum, Bitcoin and Solana.',
      'You also use Matrix, or WhatsApp and Signal through a bridge.',
    ],
    pickOther: [
      'You need calls, Secret Chats, Stories or Mini Apps.',
      'Telegram is the only network you use.',
      'You would rather not register your own API ID.',
    ],
    guide: [
      { title: 'Protocols: Telegram', href: '/guide/networks#telegram' },
      { title: 'Chats', href: '/guide/chats' },
      { title: 'Messages', href: '/guide/messages' },
    ],
    sources: [
      { title: 'Telegram FAQ', href: 'https://telegram.org/faq' },
      { title: 'Telegram privacy policy', href: 'https://telegram.org/privacy' },
      { title: 'Secret Chats', href: 'https://core.telegram.org/api/end-to-end' },
      { title: 'Obtaining an API ID', href: 'https://core.telegram.org/api/obtaining_api_id' },
      {
        title: 'Group calls',
        href: 'https://telegram.org/blog/group-calls-made-easy',
      },
      { title: 'Telegram apps', href: 'https://telegram.org/apps' },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    title: 'Statim vs WhatsApp: encryption, phone numbers and Meta',
    description:
      'WhatsApp encrypts your messages but needs a phone number and belongs to Meta. How Statim compares, and how to bring WhatsApp chats into it through a bridge.',
    summary:
      'WhatsApp is encrypted but tied to a phone number and to Meta. Statim can bring WhatsApp chats in through a bridge.',
    lead: 'WhatsApp encrypts personal chats and calls with the Signal Protocol, and it is the app many of your contacts already use. It also needs a phone number, belongs to Meta, and shares information with other Meta companies. Statim cannot talk to WhatsApp directly; a WhatsApp bridge on a Matrix server you run brings those chats into Statim.',
    glance: {
      signUp: 'Phone number',
      encrypted: 'Yes',
      openSource: 'No',
      ownServer: 'No',
      wallet: 'In some countries',
      calls: 'Yes, group',
    },
    facts: {
      signUp: 'A phone number. Usernames are announced and can be reserved, but are not live yet.',
      encryption:
        "Personal chats and calls, with the Signal Protocol. Chats with businesses that use Meta's services are not end-to-end encrypted. Backups are encrypted only if you turn that on.",
      servers: 'Meta runs every server. Using an unofficial app can get your account banned.',
      openSource: 'No published source code.',
      networks: 'In the EU, 1:1 chats with two other apps, BirdyChat and Haiket, if you opt in.',
      wallet: 'Payments in some countries, such as India over UPI.',
      calls: 'Voice and video, and group calls of up to 32 people.',
      platforms:
        'iPhone and Android, with linked devices on Windows, macOS and the web. No Linux app.',
    },
    sections: [
      {
        heading: 'What WhatsApp protects, and what it keeps',
        paragraphs: [
          'Message content is end-to-end encrypted, and WhatsApp says it cannot hand it to governments. Its privacy policy lists what it does collect: your phone number, your address book if you upload it, usage and log data, device and connection data including your IP address, and your last seen. It shares information with other Meta companies, and is adding ads to the Updates tab.',
          "Statim's developer receives two anonymous numbers: how long the app took to start, and how many devices run each version. Each protocol's own nodes or servers see what that protocol exposes, and every chat tells you what that is.",
        ],
      },
      {
        heading: 'A phone number, or not',
        paragraphs: [
          'A WhatsApp account is a phone number, and the phone stays the main device. Computers and tablets join as linked devices, up to four, and log out if the phone goes unused for too long.',
          'A Statim account is twelve words. The same account runs on a phone and a computer at the same time, with neither one in charge.',
        ],
      },
      {
        heading: 'Getting WhatsApp chats into Statim',
        paragraphs: [
          "Statim has no WhatsApp code, and WhatsApp bans unofficial apps. Statim uses a Matrix bridge instead: mautrix-whatsapp links to your WhatsApp account as a device, the way WhatsApp Web does, and your WhatsApp chats show up as Matrix chats. Statim's desktop app can [run it on your computer](/guide/computer-matrix), on a Mac with Apple silicon or on Linux, or you run it next to [your own homeserver](/guide/homeserver).",
          "WhatsApp sees the bridge as one of your linked devices. The bridge decrypts your messages on the machine where it runs and only works while that machine is on, so WhatsApp's encryption ends there.",
          'In the EU, WhatsApp also opens 1:1 chats to two outside apps, BirdyChat and Haiket, which must offer the same level of encryption. Statim is not one of them.',
        ],
      },
      {
        heading: 'Calls, groups and the rest',
        paragraphs: [
          'WhatsApp has voice and video calls, groups of up to 1,024 members, Communities and Channels. Statim has no calls, and what its groups can do depends on the protocol. It does have a self-custody wallet and a command line, which WhatsApp does not.',
        ],
      },
    ],
    pickStatim: [
      'You do not want your messenger tied to a phone number or to Meta.',
      'You want WhatsApp chats next to Telegram, Matrix and encrypted ones, through a bridge you run.',
      'You want an app whose source you can read.',
      'You want a wallet you hold the keys to.',
    ],
    pickOther: [
      'Everyone you need is on WhatsApp and you want nothing to set up.',
      'You need voice and video calls.',
      'You use WhatsApp Communities, Channels or business chats.',
    ],
    guide: [
      { title: 'WhatsApp, Signal & friends', href: '/guide/bridges' },
      { title: 'Matrix on your computer', href: '/guide/computer-matrix' },
      { title: 'Privacy', href: '/privacy' },
    ],
    sources: [
      {
        title: 'WhatsApp end-to-end encryption',
        href: 'https://faq.whatsapp.com/820124435853543',
      },
      { title: 'WhatsApp privacy policy', href: 'https://www.whatsapp.com/legal/privacy-policy' },
      { title: 'Unofficial apps', href: 'https://faq.whatsapp.com/1217634902127718' },
      { title: 'Linked devices', href: 'https://faq.whatsapp.com/378279804439436' },
      {
        title: 'Third-party chats in Europe',
        href: 'https://about.fb.com/news/2025/11/messaging-interoperability-whatsapp-enables-third-party-chats-for-users-in-europe/',
      },
      { title: 'Group calls', href: 'https://faq.whatsapp.com/829612741557179' },
    ],
  },
  {
    id: 'session',
    name: 'Session',
    title: 'Statim vs Session: two messengers without a phone number',
    description:
      'Session and Statim both start from words made on your device, with no phone number or email. How they differ on onion routing, encryption, protocols and wallets.',
    summary:
      'Both start without a phone number. Session hides your IP address; Statim joins five protocols in one list.',
    lead: 'Session and Statim start the same way: no phone number, no email, just words the app makes on your device. Session then sends everything through its own onion-routed network. Statim connects you to several existing protocols at once and keeps them in one chat list.',
    glance: {
      signUp: 'Nothing',
      encrypted: 'Yes, except Communities',
      openSource: 'Yes, GPL 3.0',
      ownServer: 'Community servers',
      wallet: 'No',
      calls: '1:1, in beta',
    },
    facts: {
      signUp:
        'Nothing. An Account ID and a Recovery Password, a list of words made on your device.',
      encryption:
        'DMs and groups, without forward secrecy until Session Protocol v2 reaches the apps. Communities are encrypted only on the way to their server.',
      servers:
        'Session Nodes, run by the community and staked with SESH. Onion routing means no node sees both ends of a message. Communities run on servers their owners host.',
      openSource: 'The apps under GPL 3.0; the node software under MIT and GPL 3.0.',
      networks: 'None.',
      wallet: 'None in the app. The SESH token pays for staking nodes.',
      calls: '1:1 calls in beta, off by default. No group calls.',
      platforms: 'iPhone, Android, macOS, Windows and Linux.',
    },
    sections: [
      {
        heading: 'Your account',
        paragraphs: [
          'Session gives you an Account ID and a Recovery Password, which is a list of words. Statim gives you twelve words. In both, nobody can reset the account: lose the words and the device, and it is gone.',
          'What a restore brings back differs. Session restores 14 days of messages, and your contacts and groups only if one of your devices was online in the last 30 days. In Statim the phrase brings back the account, its addresses and the wallet, and history depends on the protocol: XMTP restores it from its nodes, Telegram and Matrix from their servers, Nostr and Status only what their relays and store nodes still hold.',
        ],
      },
      {
        heading: 'Who sees what',
        paragraphs: [
          "Session sends messages as onion requests, so no single node knows both where a message came from and where it is going. By Session's own FAQ, two things get around that: fast push notifications show your IP address to Apple or Google and your Account ID to a server the Session Technology Foundation runs, and a call shows your IP address to the other person.",
          "Statim has no onion routing. Each protocol's nodes and relays see your network address: XMTP nodes see that two inboxes talk, Nostr relays see who receives a message but not who sent it, Status nodes see which topics you follow. If hiding your IP address from the network matters most to you, Session does more here.",
        ],
      },
      {
        heading: 'Encryption',
        paragraphs: [
          'Session encrypts DMs and groups end to end, without forward secrecy for now. Its Protocol v2 adds forward secrecy and post-quantum keys; it is written but not yet in the apps. Session Communities are encrypted only on the way to their server.',
          'In Statim, XMTP uses MLS with forward secrecy, Nostr uses sealed DMs (NIP-17), and Status moves to a Double Ratchet once both sides have written. Telegram chats are not end-to-end encrypted, and every Telegram chat says so.',
        ],
      },
      {
        heading: 'Network and money',
        paragraphs: [
          'Session Nodes are run by the community, and a full node stakes 25,000 SESH, a token on Ethereum and Arbitrum launched in May 2025. The app has no wallet. The foundation behind Session is in Switzerland, and wrote in 2026 that it now runs on donations with two or three developers. Statim is smaller still: one maintainer, and no token.',
          "Statim's wallet holds Ethereum and its chains, Bitcoin and Solana, from the same twelve words as the account. It stays off until you turn it on.",
        ],
      },
    ],
    pickStatim: [
      'You want XMTP, Nostr, Status, Telegram and Matrix chats in one list.',
      'You want forward secrecy today, which XMTP has.',
      'You want a self-custody wallet in the same app.',
      'You want people to reach you by an Ethereum address or ENS name.',
    ],
    pickOther: [
      'Hiding your IP address from the network matters more to you than anything else here.',
      'The people you talk to are already on Session.',
      'You want 1:1 calls, which Session has in beta.',
    ],
    guide: [
      { title: 'Your account', href: '/guide/account' },
      { title: 'Protocols at a glance', href: '/guide/networks#at-a-glance' },
      { title: 'Privacy', href: '/privacy' },
    ],
    sources: [
      { title: 'Session FAQ', href: 'https://getsession.org/faq' },
      {
        title: 'Account restoration',
        href: 'https://docs.getsession.org/session-network/session-protocol/account-restoration',
      },
      { title: 'Session Nodes', href: 'https://docs.getsession.org/session-network/session-nodes' },
      {
        title: 'Session Protocol v2 update',
        href: 'https://getsession.org/blog/session-protocol-v2-update',
      },
      { title: 'The future of Session', href: 'https://getsession.org/blog/the-future-of-session' },
    ],
  },
  {
    id: 'simplex',
    name: 'SimpleX Chat',
    title: 'Statim vs SimpleX Chat: two ways to skip the phone number',
    description:
      'SimpleX gives you no user identifier at all; Statim gives you keys and addresses on five protocols. How they compare on metadata, servers, calls and wallets.',
    summary:
      'SimpleX has no user identifiers at all. Statim gives you addresses people can find, on several protocols.',
    lead: 'SimpleX Chat gives its users no identifier at all, not even a random one: each contact reaches you through its own pair of message queues. Statim goes the other way. Your twelve words give you an Ethereum address, a Nostr key and a Status chat key that people can write to, and the app puts those protocols and your Telegram and Matrix chats in one list.',
    glance: {
      signUp: 'Nothing',
      encrypted: 'Yes',
      openSource: 'Yes, AGPL 3.0',
      ownServer: 'Yes',
      wallet: 'No',
      calls: '1:1',
    },
    facts: {
      signUp: 'Nothing. No user identifier of any kind; you connect through links and QR codes.',
      encryption:
        'Every DM and group, with a Double Ratchet. DMs add a post-quantum key exchange. Channel content is visible to the relays that serve it.',
      servers:
        'Two preset operators, SimpleX Chat Ltd and Flux, or servers you run. Private routing hides your IP address from the server that delivers to your contact.',
      openSource: 'The app and the servers, under AGPL 3.0.',
      networks: 'None.',
      wallet: 'None, and no token. Public names, in beta, are registered on Ethereum.',
      calls: '1:1 voice and video. No group calls.',
      platforms: 'iPhone, Android, macOS, Windows and Linux, plus a terminal app.',
    },
    sections: [
      {
        heading: 'Being found',
        paragraphs: [
          'With SimpleX, nobody can message you without a link or QR code you gave them, and the servers cannot tell that two queues belong to the same person. There is no directory and nothing to look up. Version 7.0 adds public names, registered on Ethereum, as a beta.',
          'In Statim, people reach you by an Ethereum address or ENS name on XMTP, an `npub…` key on Nostr, or a `zQ3sh…` chat key on Status. That makes you easy to find. A first message from someone new waits under Requests until you accept it, and you can block a DM on every protocol.',
        ],
      },
      {
        heading: 'Servers',
        paragraphs: [
          'SimpleX ships with two preset operators, SimpleX Chat Ltd and Flux, and lets you add your own servers. Since version 6.0 it can route messages privately, so the destination server never sees your IP address. Tor needs a separate proxy app.',
          "Statim uses each protocol's own network: XMTP's nodes, the Nostr relays you choose, Status's nodes or your own, and the Matrix homeserver you sign in to. The developer runs none of them. None of them hides your IP address the way SimpleX's private routing does.",
        ],
      },
      {
        heading: 'Encryption',
        paragraphs: [
          'SimpleX encrypts every DM and group with a Double Ratchet, and DMs also get a post-quantum key exchange. In its channels, added in 2026, the content is visible to the relays that carry it.',
          "Statim's encryption is whatever the chat's protocol provides: MLS on XMTP, sealed DMs on Nostr, Status's own scheme, Olm and Megolm in encrypted Matrix chats, and none on Telegram. Every chat shows which applies.",
        ],
      },
      {
        heading: 'Devices, calls and money',
        paragraphs: [
          'A SimpleX profile lives on one device; the desktop app links to your phone over the same local network. Statim runs the same account on a phone and a computer at the same time, from the same twelve words.',
          "SimpleX has 1:1 voice and video calls; Statim has none. SimpleX has no wallet or token. Statim's wallet is a plugin for Ethereum and its chains, Bitcoin and Solana.",
        ],
      },
    ],
    pickStatim: [
      'You want people to reach you by an address, an ENS name or a public key.',
      'You want Telegram and Matrix in the same list as your encrypted chats.',
      'You want a wallet in the chat.',
      'You want the same account on your phone and your computer at once.',
    ],
    pickOther: [
      'You want no identifier at all, and contacts only through links you hand out.',
      'You want your IP address hidden from the servers that deliver your messages.',
      'You need 1:1 calls.',
      'You want post-quantum encryption in DMs today.',
    ],
    guide: [
      { title: 'Chats: requests and blocking', href: '/guide/chats#requests' },
      { title: 'Protocols at a glance', href: '/guide/networks#at-a-glance' },
      { title: 'Privacy', href: '/privacy' },
    ],
    sources: [
      { title: 'SimpleX Chat', href: 'https://simplex.chat' },
      { title: 'SimpleX FAQ', href: 'https://simplex.chat/faq' },
      { title: 'SimpleX privacy policy', href: 'https://simplex.chat/privacy' },
      {
        title: 'simplex-chat on GitHub',
        href: 'https://github.com/simplex-chat/simplex-chat',
      },
      {
        title: 'Audio and video calls',
        href: 'https://github.com/simplex-chat/simplex-chat/blob/stable/docs/guide/audio-video-calls.md',
      },
    ],
  },
  {
    id: 'beeper',
    name: 'Beeper',
    title: 'Statim vs Beeper: two ways to get every chat in one app',
    description:
      'Beeper and Statim both put chats from many networks in one list. How they differ on accounts, where the bridges run, encryption, source code, wallets and price.',
    summary:
      'Both gather many networks in one list. Beeper does it behind a Beeper account; Statim has no account at a company.',
    lead: "Beeper and Statim both put chats from many networks in one list. Beeper does it behind a Beeper account, with bridges that run in the app or on Beeper's servers. Statim has no account at a company: it speaks XMTP, Nostr, Status, Telegram and Matrix itself, and reaches WhatsApp, Signal and the rest through Matrix bridges you run.",
    glance: {
      signUp: 'Email or Google',
      encrypted: 'Depends on the network',
      openSource: 'Bridges only',
      ownServer: 'Bridges, with a Beeper account',
      wallet: 'No',
      calls: 'No',
    },
    facts: {
      signUp:
        'A Beeper account, made with an email address or a Google login, plus a recovery code Beeper never sees.',
      encryption:
        "Depends on the network. Bridges that run in the app keep that network's own encryption. Discord, Slack, Google Messages, Google Chat and LINE go through Beeper's servers.",
      servers:
        "Beeper runs the Matrix homeserver and the cloud bridges. You can run the official bridges yourself, but they still connect to Beeper's server and need a Beeper account.",
      openSource: "The bridges, under AGPL 3.0. Beeper's open source page does not list the apps.",
      networks:
        'WhatsApp, Signal, Telegram, Instagram, Messenger, LinkedIn, X, Discord, Slack, Google Messages and others, connected from the app. iMessage only on a Mac.',
      wallet: 'None.',
      calls: 'None. Beeper says video calls are not handled in the app.',
      platforms: 'iPhone, Android, macOS, Windows, Linux and ChromeOS.',
    },
    sections: [
      {
        heading: 'Accounts',
        paragraphs: [
          "Everything in Beeper hangs off a Beeper account, and your Beeper ID is a Matrix ID on Beeper's homeserver. Beeper cannot sign in to a Matrix account on another homeserver.",
          "Statim's account is twelve words on your device. XMTP, Nostr and Status work from those words alone. Telegram and Matrix are accounts you already have, signed in from the app, and any Matrix homeserver with sliding sync and password sign-in will do. No Statim server keeps a list of the networks you use.",
        ],
      },
      {
        heading: 'Where the bridges run',
        paragraphs: [
          "Beeper connects WhatsApp, Signal, Telegram, Instagram, Messenger, LinkedIn and X from inside the app, so those messages skip Beeper's servers and keep each network's own encryption. Discord, Slack, Google Messages, Google Chat and LINE run on Beeper's cloud, which stores their history with what Beeper calls zero-access encryption.",
          'Statim has no bridge code of its own. Telegram and Matrix are full clients inside the app. For WhatsApp, Signal, Messenger, Instagram, Slack and Discord, the desktop app can run a Matrix server with the same mautrix bridges Beeper uses, on your own computer, and iMessage on a Mac. Your phone reaches it over Tailscale. That needs a Mac with Apple silicon or Linux; on Windows you run the bridges on a server instead. A bridge holds your messages in plaintext where it runs, so with Statim that is a machine you control.',
        ],
      },
      {
        heading: 'Setup and price',
        paragraphs: [
          'Beeper is the easier of the two. You sign in to each network from the app on any platform, free for up to five accounts and from $9.99 a month for more.',
          'In Statim, Telegram and Matrix take a few minutes, and Telegram wants an API ID you register yourself. WhatsApp or Signal means turning on a bridge on your computer, or [running a homeserver](/guide/homeserver). Statim has no paid tier.',
        ],
      },
      {
        heading: 'What else is in each',
        paragraphs: [
          'Statim has encrypted protocols Beeper does not speak: XMTP, Nostr and Status. It has a wallet plugin for Ethereum and its chains, Bitcoin and Solana, which Beeper has no equivalent of.',
          'Both let an AI assistant work with your chats: Beeper through its Desktop API and MCP server, Statim through the `statim` command and `statim mcp`. Neither has calls.',
        ],
      },
    ],
    pickStatim: [
      'You want no account at a company, and bridges on hardware you control.',
      'You want XMTP, Nostr or Status chats, or a wallet, next to the rest.',
      'You want an app whose whole source you can read.',
      'You already run a Matrix homeserver, or want to.',
    ],
    pickOther: [
      'You want WhatsApp, Signal, Discord and the rest working in minutes, with nothing to host.',
      'You want LinkedIn, X, Google Messages or LINE without running a homeserver.',
      'You are on Windows and want bridges without a server.',
    ],
    guide: [
      { title: 'WhatsApp, Signal & friends', href: '/guide/bridges' },
      { title: 'Matrix on your computer', href: '/guide/computer-matrix' },
      { title: 'Your own homeserver', href: '/guide/homeserver' },
      { title: 'Command line', href: '/guide/command-line' },
    ],
    sources: [
      { title: 'Beeper FAQ', href: 'https://beeper.com/faq' },
      {
        title: 'On-device chat network connections',
        href: 'https://help.beeper.com/en_US/chat-networks/using-on-device-chat-network-connections-in-beeper',
      },
      { title: 'Self-hosting bridges', href: 'https://developers.beeper.com/bridges/self-hosting' },
      { title: 'The new Beeper', href: 'https://blog.beeper.com/2025/07/16/the-new-beeper/' },
      {
        title: 'Top Beeper FAQs',
        href: 'https://help.beeper.com/en_US/quick-references/top-beeper-faqs',
      },
    ],
  },
  {
    id: 'element',
    name: 'Element',
    title: 'Statim vs Element: two Matrix clients compared',
    description:
      'Element and Statim are both Matrix clients built on matrix-rust-sdk. Element does more with Matrix; Statim adds XMTP, Nostr, Status and Telegram to the same list.',
    summary:
      'Both are Matrix clients. Element does more with Matrix; Statim puts four other protocols beside it.',
    lead: 'Element is the Matrix client from Element, the London company that also makes the Synapse homeserver. Statim is a Matrix client too, built on the same matrix-rust-sdk as Element X, with XMTP, Nostr, Status and Telegram in the same chat list. For Matrix on its own, Element does more.',
    glance: {
      signUp: 'A Matrix account',
      encrypted: 'Yes, except public chats',
      openSource: 'Yes, AGPL 3.0',
      ownServer: 'Yes',
      wallet: 'No',
      calls: 'Yes, group',
    },
    facts: {
      signUp:
        'A Matrix account on any homeserver. matrix.org asks for a username, a password and an email address.',
      encryption:
        'Olm and Megolm, on by default in new chats that are not public. Public chats are not encrypted.',
      servers:
        'Whichever homeserver you choose: matrix.org, one your company runs, or Synapse on your own machine.',
      openSource:
        'The apps, Synapse and Element Call, under AGPL 3.0 or a paid commercial licence.',
      networks: 'Matrix, and whatever your homeserver bridges in.',
      wallet: 'None.',
      calls: 'Encrypted voice and video calls, groups included, built into Element X.',
      platforms:
        'Element X on iPhone and Android. The classic Element app on the web, macOS, Windows and Linux.',
    },
    sections: [
      {
        heading: 'Same protocol, same library',
        paragraphs: [
          "Statim's Matrix support runs on matrix-rust-sdk, the library under Element X, on the phone and the computer. It has the same requirement: a homeserver with sliding sync, which Synapse has had since version 1.114.",
          'The difference shows at sign-in. Since April 2025 matrix.org signs people in through a web page, its Matrix Authentication Service. Element X supports that and Statim does not yet. Statim signs in with a password, so it needs a homeserver that still offers one.',
        ],
      },
      {
        heading: 'What Element does that Statim does not',
        paragraphs: [
          'Element X has calls built in. Element Call handles voice and encrypted group video; Statim has no calls on any protocol.',
          'Element X has had Spaces, which group chats together, since March 2026. Element also makes a web app, Element Pro for companies, and paid server plans for organisations.',
        ],
      },
      {
        heading: 'What Statim adds',
        paragraphs: [
          'XMTP, Nostr and Status work from your twelve words with no account to create, and Telegram signs in with your own account. They all sit in one chat list with your Matrix chats, each marked with its protocol and what that protocol protects.',
          'On a Mac with Apple silicon or on Linux, the desktop app can [run a Matrix server for you](/guide/computer-matrix) with bridges to WhatsApp, Signal, Messenger, Instagram, Slack and Discord, and iMessage on a Mac. There is nothing to rent or configure. That server is closed to other Matrix servers and exists for your bridges.',
          'Statim also has a wallet plugin and a `statim` command line for scripts and AI assistants.',
        ],
      },
      {
        heading: 'Encryption',
        paragraphs: [
          'Both use Olm and Megolm, so encrypted Matrix chats behave the same way in each. A message sent before your device joined a chat shows as waiting for its keys in both, because that device was never given them.',
        ],
      },
    ],
    pickStatim: [
      'You want Matrix next to Telegram, XMTP, Nostr or Status in one list.',
      'You want WhatsApp or Signal bridged on your own computer, without renting a server.',
      'You want a wallet or a command line in the same app.',
    ],
    pickOther: [
      'You need voice or video calls.',
      'Your homeserver only signs in through a web page, as matrix.org does.',
      'You use Spaces, or want a web app.',
      'Your organisation runs Element.',
    ],
    guide: [
      { title: 'Protocols: Matrix', href: '/guide/networks#matrix' },
      { title: 'Matrix on your computer', href: '/guide/computer-matrix' },
      { title: 'Your own homeserver', href: '/guide/homeserver' },
    ],
    sources: [
      {
        title: 'Element end-to-end encryption',
        href: 'https://element.io/en/features/end-to-end-encryption',
      },
      {
        title: 'matrix.org now running MAS',
        href: 'https://matrix.org/blog/2025/04/morg-now-running-mas/',
      },
      {
        title: 'Spaces has landed on Element X',
        href: 'https://element.io/blog/spaces-has-landed-on-element-x/',
      },
      {
        title: 'Element Call',
        href: 'https://element.io/blog/operator-i-need-an-exit-from-big-tech-calls/',
      },
      { title: 'Element pricing', href: 'https://element.io/en/pricing' },
    ],
  },
];

export function comparisonPath(comparison: Comparison) {
  return `/compare/statim-vs-${comparison.id}`;
}

export function getComparison(slug: string) {
  let comparison = comparisons.find((item) => `statim-vs-${item.id}` === slug);
  if (!comparison) throw new Error(`No comparison for ${slug}`);
  return comparison;
}
