import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import fs from 'fs';
import { store, Request, RequestState, QrFormat, ChatMode } from './store.ts';

// Disable octet stream warning
// https://github.com/yagop/node-telegram-bot-api/issues/838
process.env.NTBA_FIX_319 = "1";
process.env.NTBA_FIX_350 = "0";

dotenv.config();

if (process.env.TELEGRAM_TOKEN == undefined) {
  throw new Error("TELEGRAM_TOKEN is not defined in the environment variables.");
}

const bot = new TelegramBot(
    process.env.TELEGRAM_TOKEN,
    { polling: true }
);

bot.onText(/\/start/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `👋 Welcome to the QR Code Bot!
I can generate QR codes from text.
Send me any text, and I'll create a QR code for you!
Use /help for more info.`;

  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/help/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const helpMessage = `📖 **How to Use This Bot**
1. Send me any text, and I'll generate a QR code for it.
2. Use /settings to configure the QR code format (e.g., PNG, SVG).
3. Use /start to see the welcome message again.

**Commands:**
/start - Welcome message
/help - Show this help message
/settings - Configure QR code settings`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/settings/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const settingsMessage = `⚙️ **Settings**
Choose the QR code format:
1. PNG (default)
2. SVG

Use /setPng for PNG or /setSvg for SVG.`;

  bot.sendMessage(chatId, settingsMessage);

  // Mark user as having launched /settings
  store.getState().setChatMode(chatId, ChatMode.Settings);

  // Handle user's choice
  bot.once('message', (msg: TelegramBot.Message) => {
    const choice = msg.text;
    let format;

    switch (choice) {
      case '/set_png':
        format = QrFormat.Png;
        break;
      case '/set_svg':
        format = QrFormat.Svg;
        break;
      default:
        bot.sendMessage(chatId, 'Invalid choice. Please try again.');
        return;
    }

    store.getState().setChatFormat(chatId, format);
    console.log(store.getState());

    bot.sendMessage(chatId, `✅ QR code format set to ${format.toUpperCase()}.`);
    // Back to the normal mode
    store.getState().setChatMode(chatId, ChatMode.Normal);
  });
});

bot.on('message', (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const id = msg.message_id;
  const text = msg.text;

  // kinda awful
  let chat = store.getState().chats.find(chat => chat.id === chatId);

  if (!chat) {
    // const userId = msg.from.id;
    store.getState().newChat(chatId);
    chat = store.getState().chats.find(chat => chat.id === chatId);
    console.log("new chat!", chat);
  };

  if (chat && text) {
    // Ignore commands (start, help, settings)
    if (text.startsWith('/')) {
      return;
    };

    const format: QrFormat = chat.format;

    store.getState().newRequest({ id, chatId, text, format });
    store.getState().processRequest(id);
    store.getState().genQr({ text, format })
      .then((response) => store.getState().completeRequest({ id, response }))
      .catch((error: Error) =>  store.getState().abortRequest({ id, error }));
  }
});

const animateLoading = ({ messageId, requestId } : { messageId: number, requestId: number }) => {
  return new Promise((resolve) => {
    const getRequest = () => store
      .getState()
      .requests
      .find(req => req.id === requestId);

    const condition = () => getRequest().state === RequestState.Processing;

    // Return messageId immediately if condition is not met
    if (!condition()) {
      resolve(messageId);
      return;
    }

    const phases = ['.', '..', '...'];
    const chatId = getRequest().chatId;

    const runSteps = () => {
      const steps = phases.reduce((promiseChain, phase) => {
        return promiseChain
          .then(() => {
            if (condition()) {
              bot.editMessageText(
                phase, {
                  chat_id: chatId,
                  message_id: messageId
                })
            }
          })
          .then(() => new Promise(resolve => setTimeout(resolve, 1000)))
      }, Promise.resolve());

      steps.then(() => {
        if (condition()) {
          runSteps();
        } else {
          // Resolve with messageId when condition is no longer met
          resolve(messageId);
        }
      });
    };

    runSteps();
  });
};

let previousRequests = store.getState().requests;
let previousChats = store.getState().chats;

const handleNewRequests = (currentRequests: Request[], previousRequests: Request[]) => {
  if (currentRequests.length > previousRequests.length) {
    const previousIds = previousRequests.map(item => item.id);
    const newElements = currentRequests.filter(item => !previousIds.includes(item.id));
    console.log("new request!", newElements);
  }
};

const handleStateChange = (currentRequest: Request, previousRequest: Request) => {
  if (previousRequest.state !== currentRequest.state) {
    switch (currentRequest.state) {
      case RequestState.New:
        console.log("Request is now New:", currentRequest.id);
        break;
      case RequestState.Processing:
        console.log("Request is now Processing:", currentRequest.id);
        bot.sendMessage(
          currentRequest.chatId,
          `Bot is now Processing: ${currentRequest.text}`, {
            reply_to_message_id: currentRequest.id
          })
          .then((sentMessage: TelegramBot.Message) => {
            return animateLoading({
              messageId: sentMessage.message_id,
              requestId: currentRequest.id
            });
          });
        break;
      case RequestState.Completed:
        console.log("Request is now Completed:", currentRequest);
        handleCompletedRequest(currentRequest);
        break;
      case RequestState.Error:
        console.log("Request is now in Error state:", currentRequest.id);
        break;
      default:
        console.log("Unknown state for request:", currentRequest.id);
        break;
    }
  }
};

const handleCompletedRequest = (currentRequest: Request) => {
  const format = currentRequest.format;
  switch (format) {
    case QrFormat.Png:
      bot.sendPhoto(
        currentRequest.chatId,
        fs.createReadStream(currentRequest.response),
        {
          caption: `QR image for request: ${currentRequest.text}`,
          reply_to_message_id: currentRequest.id
        }
      )
      .then(() => console.log('Photo sent!'))
      .catch((err: Error) => console.error('Error sending photo:', err));
      break;
    case QrFormat.Svg:
      bot.sendDocument(
        currentRequest.chatId,
        fs.createReadStream(currentRequest.response),
        {
          caption: `QR image for request: ${currentRequest.text}`,
          reply_to_message_id: currentRequest.id
        }
      )
      .then(() => console.log('SVG sent!'))
      .catch((err: Error) => console.error('Error sending SVG:', err));
      break;
    default:
      console.log('Unsupported format:', format);
      break;
  }
};

const handleChatChange = (currentChat: Chat) => {
  const mode = currentChat.mode;
  switch (mode) {
    case ChatMode.Normal:
      bot.setMyCommands([
        { command: '/start', description: 'Show start message' },
        { command: '/help', description: 'Show help message' },
        { command: '/settings', description: 'Change settings' }
      ], { scope: { type: 'chat', chat_id: currentChat.id } })
          .then(() => {
            console.log('Settings commands are now available.');
          })
          .catch((error) => {
            console.error('Error setting commands:', error);
          });
      break;
    case ChatMode.Settings:
      bot.setMyCommands([
        { command: '/set_png', description: 'Set QR code format to PNG' },
        { command: '/set_svg', description: 'Set QR code format to SVG' }
      ], { scope: { type: 'chat', chat_id: currentChat.id } })
        .then(() => {
          console.log('Settings commands are now available.');
        })
        .catch((error) => {
          console.error('Error setting commands:', error);
        });
      break;
    default:
      console.log("not supported mode", currentChat.id);
  }
};

const unsubscribe = store.subscribe(
  (state) => {
    const currentRequests = state.requests;
    handleNewRequests(currentRequests, previousRequests);

    currentRequests.forEach(currentRequest => {
      const previousRequest = previousRequests.find(req => req.id === currentRequest.id);
      if (previousRequest) {
        handleStateChange(currentRequest, previousRequest);
      }
    });

    previousRequests = currentRequests;

    const currentChats = state.chats;
    currentChats.forEach(currentChat => {
      const previousChat = previousChats.find(chat => chat.id === currentChat.id);
      if (previousChat) {
        handleChatChange(currentChat, previousChat);
      }
    })

    previousChats = currentChats;
  }
);

process.on('SIGINT', () => {
  unsubscribe();
  process.exit();
});

bot.on('polling_error', (error: Error) => {
  console.error('Polling error:', error);
  unsubscribe();
});

