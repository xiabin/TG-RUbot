/**
 * Open Wegram Bot - Core Logic
 * Shared code between Cloudflare Worker and Vercel deployments
 */
import {
  banTopic,
  checkInit,
  doCheckInit,
  fixPinMessage,
  init,
  motherBotCommands,
  parseMetaDataMessage,
  processERReceived,
  processERSent,
  processPMDeleteReceived,
  processPMDeleteSent,
  processPMEditReceived,
  processPMEditSent,
  processPMReceived,
  processPMSent,
  processTopicCommentNameEdit,
  reset,
  unbanTopic
} from './topicPmHandler.js'

export const allowed_updates = ['message', 'message_reaction', 'edited_message'];

export function validateSecretToken(token) {
  return token.length > 15 && /[A-Z]/.test(token) && /[a-z]/.test(token) && /[0-9]/.test(token);
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function postToTelegramApi(token, method, body) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export async function handleInstall(request, ownerUid, botToken, prefix, secretToken) {
  if (!validateSecretToken(secretToken)) {
    return jsonResponse({
      success: false,
      message: '密钥令牌必须至少16个字符，并包含大写字母、小写字母和数字。'
    }, 400);
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.hostname}`;
  const webhookUrl = `${baseUrl}/${prefix}/webhook/${ownerUid}/${botToken}`;

  try {
    const response = await postToTelegramApi(botToken, 'setWebhook', {
      url: webhookUrl,
      allowed_updates: allowed_updates,
      secret_token: secretToken
    });

    const result = await response.json();
    if (result.ok) {
      return jsonResponse({ success: true, message: 'Webhook 安装成功。' });
    }

    return jsonResponse({ success: false, message: `Webhook 安装失败：${result.description}` }, 400);
  } catch (error) {
    return jsonResponse({ success: false, message: `安装 Webhook 时出错：${error.message}` }, 500);
  }
}

export async function handleUninstall(botToken, secretToken) {
  if (!validateSecretToken(secretToken)) {
    return jsonResponse({
      success: false,
      message: '密钥令牌必须至少16个字符，并包含大写字母、小写字母和数字。'
    }, 400);
  }

  try {
    const response = await postToTelegramApi(botToken, 'deleteWebhook', {})

    const result = await response.json();
    if (result.ok) {
      return jsonResponse({ success: true, message: 'Webhook 卸载成功。' });
    }

    return jsonResponse({ success: false, message: `Webhook 卸载失败：${result.description}` }, 400);
  } catch (error) {
    return jsonResponse({ success: false, message: `卸载 Webhook 时出错：${error.message}` }, 500);
  }
}

export async function handleWebhook(request, ownerUid, botToken, secretToken, childBotUrl, childBotSecretToken) {
  if (secretToken !== request.headers.get('X-Telegram-Bot-Api-Secret-Token')) {
    return new Response('未授权', { status: 401 });
  }

  const update = await request.json();
  // --- for debugging ---
  // TODO: 2025/5/10 don't forget to close
  // await postToTelegramApi(botToken, 'sendMessage', {
  //   chat_id: ownerUid,
  //   text: `DEBUG MESSAGE! update: ${JSON.stringify(update)}`,
  // });
  // --- for debugging ---

  if (update.edited_message) {
    try {
      const messageEdited = update.edited_message
      const fromChat = messageEdited.chat;
      const fromUser = messageEdited.from;

      const check = await doCheckInit(botToken, ownerUid)
      if (!check.failed) {
        const metaDataMessage = check.checkMetaDataMessageResp.result.pinned_message;
        const {
          superGroupChatId,
          topicToFromChat,
          fromChatToTopic,
          bannedTopics,
          topicToCommentName,
          fromChatToCommentName
        } = parseMetaDataMessage(metaDataMessage);
        if (false) {
          // ignore message types
          return new Response('OK');
        } else if (fromUser.id.toString() === ownerUid && fromChat.id === superGroupChatId
            && fromChat.is_forum) {
          // topic ER send to others.
          await processPMEditSent(botToken, messageEdited, superGroupChatId, topicToFromChat);
        } else {
          // topic ER receive from others.
          if (!bannedTopics.includes(fromChatToTopic.get(fromChat.id))) {
            await processPMEditReceived(botToken, ownerUid, messageEdited, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName)
          }
        }
        return new Response('OK');
      }
      return new Response('OK');
    } catch (error) {
      // --- for debugging ---
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `出错了！你可以把这条消息发给开发者寻求帮助：${error.message} 堆栈：${error.stack} 原始数据：${JSON.stringify(update)}`,
      });
      // --- for debugging ---
      return new Response('OK');
    }
  }

  if (update.message_reaction) {
    try {
      // message_reaction EMOJI REACT(ER)
      const messageReaction = update.message_reaction
      const fromChat = messageReaction.chat;
      const fromUser = messageReaction.user;

      const check = await doCheckInit(botToken, ownerUid)
      if (!check.failed) {
        const metaDataMessage = check.checkMetaDataMessageResp.result.pinned_message;
        const {
          superGroupChatId,
          topicToFromChat,
          fromChatToTopic,
          bannedTopics,
          topicToCommentName,
          fromChatToCommentName
        } = parseMetaDataMessage(metaDataMessage);
        if (false) {
          // ignore message types
          return new Response('OK');
        } else if (fromUser.id.toString() === ownerUid && fromChat.id === superGroupChatId
            && fromChat.is_forum) {
          // topic ER send to others.
          await processERSent(botToken, messageReaction, topicToFromChat);
        } else {
          // topic ER receive from others.
          if (!bannedTopics.includes(fromChatToTopic.get(fromChat.id))) {
            await processERReceived(botToken, ownerUid, fromUser, messageReaction, superGroupChatId, bannedTopics);
          }
        }
        return new Response('OK');
      }
      return new Response('OK');
    } catch (error) {
      // --- for debugging ---
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `出错了！你可以把这条消息发给开发者寻求帮助：${error.message} 堆栈：${error.stack} 原始数据：${JSON.stringify(update)}`,
      });
      // --- for debugging ---
      return new Response('OK');
    }
  }

  if (!update.message) {
    return new Response('OK');
  }
  const message = update.message;
  const fromChat = message.chat;
  const fromUser = message.from;

  if (childBotUrl) {
    // --- delivery children bots ---
    return await motherBotCommands(botToken, ownerUid, message, childBotUrl, childBotSecretToken);
  }

  // --- commands ---
  try {
    if (fromUser.id.toString() === ownerUid && fromChat.is_forum
        && message.text?.startsWith(".!") && message.text?.endsWith("!.")) {
      if (!message.is_topic_message) {
        // --- commands in General topic ---
        if (message.text === ".!pm_RUbot_checkInit!.") {
          return await checkInit(botToken, ownerUid, message);
        } else if (message.text === ".!pm_RUbot_doInit!.") {
          return await init(botToken, ownerUid, message);
        } else if (message.text === ".!pm_RUbot_doReset!.") {
          return await reset(botToken, ownerUid, message, false);
        }
      } else {
        // --- commands in PM topic ---
        const check = await doCheckInit(botToken, ownerUid)
        if (!check.failed) {
          const metaDataMessage = check.checkMetaDataMessageResp.result.pinned_message;
          const {
            superGroupChatId,
            topicToFromChat,
            fromChatToTopic,
            bannedTopics,
            topicToCommentName,
            fromChatToCommentName
          } = parseMetaDataMessage(metaDataMessage);
          if (fromChat.id !== superGroupChatId) {
            await postToTelegramApi(botToken, 'sendMessage', {
              chat_id: fromChat.id,
              text: `只能在你的私信超级群组中使用`,
            });
            return new Response('OK');
          }
          if (message.text === (".!pm_RUbot_ban!.")) {
            return await banTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, false);
          } else if (message.text === (".!pm_RUbot_unban!.")) {
            return await unbanTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, false);
          } else if (message.text === (".!pm_RUbot_silent_ban!.")) {
            return await banTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, true);
          } else if (message.text === (".!pm_RUbot_silent_unban!.")) {
            return await unbanTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, true);
          }
        }
      }
      return new Response('OK');
    } else if (fromUser.id.toString() === ownerUid && fromChat.id.toString() === ownerUid
        && message.text?.startsWith(".!") && message.text?.endsWith("!.")) {
      // --- commands in Owner Chat ---
      if (message.text === ".!pm_RUbot_doReset!.") {
        return await reset(botToken, ownerUid, message, true);
      }
    }
  } catch (error) {
    // --- for debugging ---
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `出错了！你可以把这条消息发给开发者寻求帮助：${error.message} 堆栈：${error.stack} 原始数据：${JSON.stringify(update)}`,
    });
    // --- for debugging ---
    return new Response('OK');
  }
  // --- commands ---

  try {
    if ("/start" === message.text) {
      // Introduction words for various scenarios
      let introduction = "*欢迎使用\\!*" +
          "\n>我是一个私信转发机器人\\." +
          "\n>我会将你的消息转发给我的主人，主人的回复也会转发给你\\." +
          "\n*以下是详细使用说明:*" +
          "\n**>表情反应:**" +
          "\n>  你会在本消息下方看到 🕊 表情，表示转发成功\\." +
          "\n>  如果没有看到，说明消息没有被转发\\." +
          "\n>" +
          "\n>  你可以给我们的消息添加其他表情（除了这条说明），我也会帮你转发\\." +
          "\n>  但是作为机器人，受 Telegram 限制，每条消息我只能免费转发一个表情\\." +
          "\n>  如果你是会员用户并且给同一条消息添加了多个表情，我只会转发最后一个免费表情\\.||" +
          "\n**>编辑消息:**" +
          "\n>  你可以正常编辑你的消息，但目前只支持文本消息\\. " +
          "如果编辑转发成功，🦄 表情会快速出现，大约1秒后恢复为 🕊\\." +
          "\n>  如果没看到这个反馈，说明编辑没有被转发\\." +
          "\n>  如果错过了反馈，可以尝试再次编辑并修改内容\\.||" +
          "\n**>删除消息:**" +
          "\n>  你可以删除我转发的消息：回复要删除的原消息，然后发送 `#del` 给我\\." +
          " 就这么简单\\." +
          "\n>  但我只能删除我发送的消息，你的消息需要你自己删除，" +
          "包括 \\[原消息\\]、\\[删除命令\\] 和 \\[通知消息\\]\\.||" +
          "\n" +
          "\n*如果想再次查看这个说明，*" +
          "\n*发送 `/start` 给我就可以了\\.*";
      if (fromUser.id.toString() === ownerUid) {
        // for owner only
        introduction += "\n" +
            "\n*以下内容仅机器人主人可见*" +
            "\n" +
            "\n**>删除消息:**" +
            "\n>  如果我有相应权限，我可以在群组中删除你和我的消息\\." +
            "\n" +
            "\n*获取帮助*" +
            "\n这个机器人完全*开源*且*免费*使用\\. 如需帮助请邮件联系 *vivalavida@linux\\.do*\\. " +
            "\n也可以访问 [Linux Do 社区](https://linux.do/t/topic/620510?u=ru_sirius)\\." +
            "\n";
        if (fromChat.is_forum && message.is_topic_message) {
          // commands in PM topic
          introduction +=
              "\n*其他地方可用的命令:*" +
              "\n在机器人私聊中:" +
              "\n`.!pm_RUbot_doReset!.`" +
              "\n在私信超级群的总话题中:" +
              "\n`.!pm_RUbot_checkInit!.`" +
              "\n`.!pm_RUbot_doInit!.`" +
              "\n`.!pm_RUbot_doReset!.`" +
              "\n" +
              "\n*当前话题可用命令:*" +
              "\n*屏蔽此话题*" +
              "\n➡️`.!pm_RUbot_ban!.`⬅️" +
              "\n↗️*点击复制*⬆️" +
              "\n**>说明:" +
              "\n>屏蔽当前话题，停止转发该聊天的消息，并通知对方已被屏蔽\\.||" +
              "\n➡️`.!pm_RUbot_unban!.`⬅️" +
              "\n↗️*点击复制*⬆️" +
              "\n**>说明:" +
              "\n>取消屏蔽当前话题，并通知对方已解除屏蔽\\.||" +
              "\n➡️`.!pm_RUbot_silent_ban!.`⬅️" +
              "\n↗️*点击复制*⬆️" +
              "\n**>说明:" +
              "\n>静默屏蔽当前话题，仅停止转发该聊天的消息\\.||" +
              "\n➡️`.!pm_RUbot_silent_unban!.`⬅️" +
              "\n↗️*点击复制*⬆️" +
              "\n**>说明:" +
              "\n>取消静默屏蔽当前话题\\.||";
        } else if (fromChat.is_forum) {
          // commands in General topic
          introduction +=
              "\n*其他地方可用的命令:*" +
              "\n在机器人私聊中:" +
              "\n`.!pm_RUbot_doReset!.`" +
              "\n在对应的私信话题中:" +
              "\n`.!pm_RUbot_ban!.`" +
              "\n`.!pm_RUbot_unban!.`" +
              "\n`.!pm_RUbot_silent_ban!.`" +
              "\n`.!pm_RUbot_silent_unban!.`" +
              "\n" +
              "\n*当前话题可用命令:*" +
              "\n➡️`.!pm_RUbot_checkInit!.`⬅️" +
              "\n↗️*点击复制*⬆️" +
              "\n>检查初始化状态，结果会在与机器人的私聊中显示\\." +
              "\n➡️`.!pm_RUbot_doInit!.`⬅️" +
              "\n↗️*点击复制*⬆️" +
              "\n>执行初始化设置，结果会在与机器人的私聊中显示\\." +
              "\n➡️`.!pm_RUbot_doReset!.`⬅️" +
              "\n↗️*点击复制*⬆️" +
              "\n>重置所有设置，结果会在与机器人的私聊中显示\\." +
              "\n";
        } else {
          // commands in bot chat
          introduction +=
              "\n*其他地方可用的命令:*" +
              "\n在私信超级群的总话题中:" +
              "\n`.!pm_RUbot_checkInit!.`" +
              "\n`.!pm_RUbot_doInit!.`" +
              "\n`.!pm_RUbot_doReset!.`" +
              "\n在对应的私信话题中:" +
              "\n`.!pm_RUbot_ban!.`" +
              "\n`.!pm_RUbot_unban!.`" +
              "\n`.!pm_RUbot_silent_ban!.`" +
              "\n`.!pm_RUbot_silent_unban!.`" +
              "\n " +
              "\n*当前可用命令:*" +
              "\n➡️`.!pm_RUbot_doReset!.`⬅️" +
              "\n↗️*点击复制*⬆️" +
              "\n>重置所有设置\\." +
              "\n";
        }
      }
      const sendMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: fromChat.id,
        text: introduction,
        message_thread_id: message.message_thread_id,
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
      })).json();
      if (sendMessageResp.ok) {
        await postToTelegramApi(botToken, 'setMessageReaction', {
          chat_id: fromChat.id,
          message_id: sendMessageResp.result.message_id,
          reaction: [{ type: "emoji", emoji: "🕊" }]
        });
      } else {
        // for parse_mode test
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: fromChat.id,
          message_thread_id: message.message_thread_id,
          text: `响应: ${JSON.stringify(sendMessageResp)}`,
        })
      }
      return new Response('OK');
    }


    const reply = message.reply_to_message;
    const check = await doCheckInit(botToken, ownerUid)
    if (!check.failed) {
      const metaDataMessage = check.checkMetaDataMessageResp.result.pinned_message;
      const {
        superGroupChatId,
        topicToFromChat,
        fromChatToTopic,
        bannedTopics,
        topicToCommentName,
        fromChatToCommentName
      } = parseMetaDataMessage(metaDataMessage);
      if (message.forum_topic_created || message.pinned_message) {
        // ignore message types
        return new Response('OK');
      } else if (fromUser.id.toString() === ownerUid && fromChat.id === superGroupChatId
          && fromChat.is_forum && message.is_topic_message) {
        // send message in super group
        if (message.forum_topic_edited?.name) {
          // comment name for topic
          await processTopicCommentNameEdit(
              botToken,
              ownerUid,
              message.message_thread_id,
              topicToFromChat.get(message.message_thread_id),
              message.forum_topic_edited?.name,
              metaDataMessage);
        } else if (message.text === "#del" && reply?.message_id && reply?.from.id === fromUser.id && reply?.message_id !== message.message_thread_id) {
          // delete message
          await processPMDeleteSent(botToken, message, reply, superGroupChatId, topicToFromChat);
        } else {
          // topic PM send to others
          await processPMSent(botToken, message, topicToFromChat);
        }
      } else {
        // send message to bot via chat
        if (message.forum_topic_edited?.name) {
        } else if (message.text === "#fixpin" && reply?.message_id && fromUser.id.toString() === ownerUid) {
          // fix pined message
          await fixPinMessage(botToken, message.chat.id, reply.text, reply.message_id);
        } else if (message.text === "#del" && reply?.message_id && reply?.from.id === fromUser.id) {
          // delete message
          if (!bannedTopics.includes(fromChatToTopic.get(fromChat.id))) {
            await processPMDeleteReceived(botToken, ownerUid, message, reply, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage);
          }
        } else {
          // topic PM receive from others. Always receive first.
          await processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName);
        }
      }
      return new Response('OK');
    }

    if (reply && fromChat.id.toString() === ownerUid) {
      if (message.text === "#fixpin" && reply?.message_id && fromUser.id.toString() === ownerUid) {
        // fix pined message
        await fixPinMessage(botToken, message.chat.id, reply.text, reply.message_id);
        return new Response('OK');
      }

      const rm = reply.reply_markup;
      if (rm && rm.inline_keyboard && rm.inline_keyboard.length > 0) {
        let senderUid = rm.inline_keyboard[0][0].callback_data;
        if (!senderUid) {
          senderUid = rm.inline_keyboard[0][0].url.split('tg://user?id=')[1];
        }

        await postToTelegramApi(botToken, 'copyMessage', {
          chat_id: parseInt(senderUid),
          from_chat_id: fromChat.id,
          message_id: message.message_id
        });
      }

      return new Response('OK');
    }

    const sender = fromChat;
    const senderUid = sender.id.toString();
    const senderName = sender.username ? `@${sender.username}` : [sender.first_name, sender.last_name].filter(Boolean).join(' ');

    const copyMessage = async function (withUrl = false) {
      const ik = [[{
        text: `🔏 来自: ${senderName} (${senderUid})`,
        callback_data: senderUid,
      }]];

      if (withUrl) {
        ik[0][0].text = `🔓 来自: ${senderName} (${senderUid})`
        ik[0][0].url = `tg://user?id=${senderUid}`;
      }

      return await postToTelegramApi(botToken, 'copyMessage', {
        chat_id: parseInt(ownerUid),
        from_chat_id: fromChat.id,
        message_id: message.message_id,
        reply_markup: { inline_keyboard: ik }
      });
    }

    const response = await copyMessage(true);
    if (!response.ok) {
      await copyMessage();
    }

    return new Response('OK');
  } catch (error) {
    // --- for debugging ---
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `出错了！你可以把这条消息发给开发者寻求帮助：${error.message} 堆栈：${error.stack} 原始数据：${JSON.stringify(update)}`,
    });
    // --- for debugging ---
    return new Response('OK');
  }
}

export async function handleRequest(request, config) {
  const { prefix, secretToken, childBotUrl, childBotSecretToken } = config;

  const url = new URL(request.url);
  const path = url.pathname;

  const INSTALL_PATTERN = new RegExp(`^/${prefix}/install/([^/]+)/([^/]+)$`);
  const UNINSTALL_PATTERN = new RegExp(`^/${prefix}/uninstall/([^/]+)$`);
  const WEBHOOK_PATTERN = new RegExp(`^/${prefix}/webhook/([^/]+)/([^/]+)$`);

  let match;

  if (match = path.match(INSTALL_PATTERN)) {
    return handleInstall(request, match[1], match[2], prefix, secretToken);
  }

  if (match = path.match(UNINSTALL_PATTERN)) {
    return handleUninstall(match[1], secretToken);
  }

  if (match = path.match(WEBHOOK_PATTERN)) {
    return handleWebhook(request, match[1], match[2], secretToken, childBotUrl, childBotSecretToken);
  }

  return new Response('页面未找到', { status: 404 });
}