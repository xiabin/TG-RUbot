import { allowed_updates, postToTelegramApi } from './core';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

// ---------------------------------------- MOTHER BOT ----------------------------------------

export async function motherBotCommands(botToken, ownerUid, message, childBotUrl, childBotSecretToken) {
  const sendRespMessage = async function (chat_id, text) {
    return await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: chat_id,
      text: text,
    });
  }

  try {
    if (message.text.startsWith("/install ")) {
      const childBotOwnerId = message.from.id.toString();
      const childBotToken = message.text.split("/install ")[1];
      const setWebhookResp = await (await postToTelegramApi(childBotToken, 'setWebhook', {
        url: `${childBotUrl.endsWith('/') ? childBotUrl.slice(0, -1) : childBotUrl}/webhook/${childBotOwnerId}/${childBotToken}`,
        allowed_updates: allowed_updates,
        secret_token: childBotSecretToken
      })).json();
      if (setWebhookResp.ok) {
        await sendRespMessage(message.chat.id, `机器人 ${childBotToken} 安装成功！`);
      } else {
        await sendRespMessage(message.chat.id, `机器人 ${childBotToken} 安装失败！${JSON.stringify(setWebhookResp)}`);
      }
    } else if (message.text.startsWith("/uninstall ")) {
      const childBotToken = message.text.split("/uninstall ")[1];
      const deleteWebhookResp = await (await postToTelegramApi(childBotToken, 'deleteWebhook', {})).json();
      if (deleteWebhookResp.ok) {
        await sendRespMessage(message.chat.id, `机器人 ${childBotToken} 卸载成功！`);
      } else {
        await sendRespMessage(message.chat.id, `机器人 ${childBotToken} 卸载失败！${JSON.stringify(deleteWebhookResp)}`);
      }
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: message.chat.id,
        text: `没有此命令！请试试 '/install {{botToken}}' 或 '/uninstall {{botToken}}'`,
      });
    }
    return new Response('OK');
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // --- for debugging ---
    return new Response('OK');
  }
}

// ---------------------------------------- SETTINGS ----------------------------------------

export async function init(botToken, ownerUid, message) {
  try {
    const supergroupId = message.chat.id;
    const metaDataMessage = supergroupId.toString();

    let failed = false;
    let failedMessage = "初始化失败，请重试";
    let sendMetaDataMessageResp;
    let pinMetaDataMessageResp;

    const check = await doCheckInit(botToken, ownerUid)
    if (!check.failed) {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: "已经初始化过了！",
      });
      return new Response('OK');
    }

    sendMetaDataMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: metaDataMessage,
    })).json();
    if (!sendMetaDataMessageResp.ok) {
      failedMessage += " sendMetaDataMessageResp: " + JSON.stringify(sendMetaDataMessageResp);
      failed = true;
    }
    if (!failed) {
      pinMetaDataMessageResp = await (await postToTelegramApi(botToken, 'pinChatMessage', {
        chat_id: ownerUid,
        message_id: sendMetaDataMessageResp.result.message_id,
      })).json();
      if (!pinMetaDataMessageResp.ok) {
        failedMessage += " pinMetaDataMessageResp: " + JSON.stringify(pinMetaDataMessageResp);
        failed = true;
      }
    }
    return checkInit(botToken, ownerUid, message, failed, failedMessage);
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // // --- for debugging ---
    return new Response('OK');
  }
}

export async function checkInit(botToken, ownerUid, message, failed, failedMessage) {
  try {
    const supergroupId = message.chat.id;

    failed = failed || false;
    failedMessage = failedMessage || "初始化检查失败，请先进行初始化或重试";
    let checkMetaDataMessageResp;
    if (!failed) {
      const doCheckInitRet = await doCheckInit(botToken, ownerUid, failedMessage, failed);
      checkMetaDataMessageResp = doCheckInitRet.checkMetaDataMessageResp;
      failedMessage = doCheckInitRet.failedMessage;
      failed = doCheckInitRet.failed;
    }
    if (failed) {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `群组 ${supergroupId}：${failedMessage}`,
      });
    } else {
      const { superGroupChatId: superGroupIdFromMetaDataMessage }
          = parseMetaDataMessage(checkMetaDataMessageResp.result.pinned_message);
      if (superGroupIdFromMetaDataMessage !== supergroupId) {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `群组 ${supergroupId}：初始化失败！因为已经初始化了群组 ${superGroupIdFromMetaDataMessage}`,
        });
      } else {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `群组 ${supergroupId}：初始化成功！`,
        });
      }
    }
    return new Response('OK');
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // // --- for debugging ---
    return new Response('OK');
  }
}

export async function doCheckInit(botToken, ownerUid, failedMessage, failed) {
  const checkMetaDataMessageResp = await (await postToTelegramApi(botToken, 'getChat', {
    chat_id: ownerUid,
  })).json();

  if (!checkMetaDataMessageResp.ok || !checkMetaDataMessageResp.result.pinned_message?.text) {
    failedMessage += " checkMetaDataMessageResp: " + JSON.stringify(checkMetaDataMessageResp);
    failed = true;
  } else {
    const dateSecondTimestamp = checkMetaDataMessageResp.result.pinned_message?.date;
    if (dateSecondTimestamp) {
      const pinnedMessage = checkMetaDataMessageResp.result.pinned_message;
      const currentSeconds = Math.floor(Date.now() / 1000);
      const dateDiff = currentSeconds - dateSecondTimestamp;
      const days = Math.floor(dateDiff / 60 / 60 / 24);
      if (days > 7) {
        await fixPinMessage(botToken, pinnedMessage.chat.id, pinnedMessage.text, pinnedMessage.message_id)

        const pmGroupId = pinnedMessage.text.split(";")[0];
        const pmGroupChatResp = await (await postToTelegramApi(botToken, 'getChat', {
          chat_id: pmGroupId,
        })).json();
        if (pmGroupChatResp.ok && pmGroupChatResp.result.pinned_message?.text) {
          const pmGroupPinnedMessage = pmGroupChatResp.result.pinned_message;
          await fixPinMessage(botToken, pmGroupPinnedMessage.chat.id, pmGroupPinnedMessage.text, pmGroupPinnedMessage.message_id)
        }
      }
    }
  }
  return { checkMetaDataMessageResp, failedMessage, failed };
}

export function parseMetaDataMessage(metaDataMessage) {
  const metaDataSplit = metaDataMessage.text.split(";");
  const superGroupChatId = parseInt(metaDataSplit[0]);
  const topicToFromChat = new Map;
  const fromChatToTopic = new Map;
  const topicToCommentName = new Map;
  const fromChatToCommentName = new Map;
  const bannedTopics = [];
  if (metaDataSplit.length > 1) {
    for (let i = 1; i < metaDataSplit.length; i++) {
      const topicToFromChatSplit = metaDataSplit[i].split(":");
      const topic = parseInt(topicToFromChatSplit[0]);
      if (!topic) continue
      let fromChat;
      if (topicToFromChatSplit[1].startsWith('b')) {
        bannedTopics.push(topic);
        fromChat = parseInt(topicToFromChatSplit[1].substring(1));
      } else {
        fromChat = parseInt(topicToFromChatSplit[1]);
      }
      topicToFromChat.set(topic, fromChat);
      fromChatToTopic.set(fromChat, topic);
      if (topicToFromChatSplit[2]) {
        topicToCommentName.set(topic, topicToFromChatSplit[2]);
        fromChatToCommentName.set(fromChat, topicToFromChatSplit[2]);
      }
    }
  }
  return { superGroupChatId, topicToFromChat, fromChatToTopic, bannedTopics, topicToCommentName, fromChatToCommentName };
}

async function addTopicToFromChatOnMetaData(botToken, metaDataMessage, ownerUid, topicId, fromChatId) {
  const newText = `${metaDataMessage.text};${topicId}:${fromChatId}`
  return await editMetaDataMessage(botToken, ownerUid, metaDataMessage, newText);
}

async function cleanItemOnMetaData(botToken, metaDataMessage, ownerUid, topicId) {
  const oldText = metaDataMessage.text;
  let itemStartIndex = oldText.indexOf(`;${topicId}:`) + 1;
  if (itemStartIndex === 0) return { messageText: oldText };
  let itemEndIndex = oldText.indexOf(';', itemStartIndex);
  let newText = itemEndIndex === -1 ? oldText.substring(0, itemStartIndex - 1)
      : oldText.replace(oldText.substring(itemStartIndex, itemEndIndex + 1), '');
  return await editMetaDataMessage(botToken, ownerUid, metaDataMessage, newText);
}

async function editMetaDataMessage(botToken, ownerUid, metaDataMessage, newText) {
  // TODO: 2025/5/10 MAX LENGTH 4096
  const editMessageTextResp = await (await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  })).json();
  if (!editMessageTextResp.ok) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `editMetaDataMessage: editMessageTextResp: ${JSON.stringify(editMessageTextResp)}`,
    });
  }
  metaDataMessage.text = editMessageTextResp.result.text;
  return { messageText: editMessageTextResp.result.text };
}

async function banTopicOnMetaData(botToken, ownerUid, metaDataMessage, topicId) {
  const oldText = metaDataMessage.text;
  if (oldText.includes(`;${topicId}:b`)) {
    return { isBannedBefore: true, messageText: oldText };
  }
  const newText = oldText.replace(`;${topicId}:`, `;${topicId}:b`);
  await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  });
  return { isBannedBefore: false, messageText: newText };
}

async function unbanTopicOnMetaData(botToken, ownerUid, metaDataMessage, topicId) {
  const oldText = metaDataMessage.text;
  if (!oldText.includes(`;${topicId}:b`)) {
    return { isNotBannedBefore: true, messageText: oldText };
  }
  const newText = oldText.replace(`;${topicId}:b`, `;${topicId}:`);
  await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  });
  return { isNotBannedBefore: false, messageText: newText };
}

export async function reset(botToken, ownerUid, message, inOwnerChat) {
  try {
    const supergroupId = message.chat.id;

    let unpinMetaDataMessageResp;

    const check = await doCheckInit(botToken, ownerUid)
    if (!check.failed) {
      const { superGroupChatId: superGroupChatIdFromMetaData }
          = parseMetaDataMessage(check.checkMetaDataMessageResp.result.pinned_message)
      if (inOwnerChat || superGroupChatIdFromMetaData === supergroupId) {
        unpinMetaDataMessageResp = await (await postToTelegramApi(botToken, 'unpinAllChatMessages', {
          chat_id: ownerUid,
        })).json();
        if (!unpinMetaDataMessageResp.ok) {
          await postToTelegramApi(botToken, 'sendMessage', {
            chat_id: ownerUid,
            text: `重置失败！`,
          });
        } else {
          await postToTelegramApi(botToken, 'sendMessage', {
            chat_id: ownerUid,
            text: `重置成功！`,
          });
        }
      } else {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `无法从不是当前使用的群组进行重置！`,
        });
      }
      return new Response('OK');
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: "尚未初始化！",
      });
      return new Response('OK');
    }
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // // --- for debugging ---
    return new Response('OK');
  }
}

// ---------------------------------------- PRIVATE MESSAGE ----------------------------------------

function parseMdReserveWord(str) {
  return str
      .replaceAll("_", "\\_")
      .replaceAll("*", "\\*")
      .replaceAll("[", "\\[")
      .replaceAll("]", "\\]")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)")
      .replaceAll("~", "\\~")
      .replaceAll("`", "\\`")
      .replaceAll(">", "\\>")
      .replaceAll("#", "\\#")
      .replaceAll("+", "\\+")
      .replaceAll("-", "\\-")
      .replaceAll("=", "\\=")
      .replaceAll("|", "\\|")
      .replaceAll("{", "\\{")
      .replaceAll("}", "\\}")
      .replaceAll(".", "\\.")
      .replaceAll("!", "\\!");
}

export async function processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName) {
  const fromChat = message.chat;
  const fromUserId = message.from.id;
  const fromChatId = fromChat.id;
  const pmMessageId = message.message_id;
  let topicId = fromChatToTopic.get(fromChatId);
  let isNewTopic = false;
  let commentName = fromChatToCommentName.get(fromChatId) ?
      `${fromChatToCommentName.get(fromChatId)} | ` : '';
  const maxTopicNameLen = 127;
  const maxFromChatNameLen = maxTopicNameLen - (commentName.length + `${fromChatId}`.length + 6);
  const maxCommentNameLen = maxTopicNameLen - (`${fromChatId}`.length + 6);
  commentName = commentName.substring(0, maxCommentNameLen);
  let fromChatName = fromChat.username ?
      `@${fromChat.username}` : [fromChat.first_name, fromChat.last_name].filter(Boolean).join(' ');
  fromChatName = fromChatName.substring(0, maxFromChatNameLen);
  fromChatName = fromChatName.replace(/\|/g, '｜');

  const lengthCheckDo = function (topicName, newTopicName) {
    if (topicName.length > 128) {
      return newTopicName;
    } else {
      return topicName;
    }
  }
  let topicName = `${commentName}${fromChatName} ${fromChatId === fromUserId ? `(${fromChatId})` : `(${fromChatId})(${fromUserId})`}`;
  topicName = lengthCheckDo(topicName, `${commentName}${fromChatName} (${fromChatId})`);
  topicName = lengthCheckDo(topicName, `${commentName} (${fromChatId})`);
  topicName = lengthCheckDo(topicName, `(${fromChatId})`.substring(0, maxTopicNameLen));

  if (!topicId) {
    const createTopicResp = await (await postToTelegramApi(botToken, 'createForumTopic', {
      chat_id: superGroupChatId,
      name: topicName,
    })).json();
    topicId = createTopicResp.result?.message_thread_id
    if (!createTopicResp.ok || !topicId) {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `调试信息！chatId: ${superGroupChatId} topicName: ${topicName} createTopicResp: ${JSON.stringify(createTopicResp)}`,
      });
      return;
    }
    await addTopicToFromChatOnMetaData(botToken, metaDataMessage, ownerUid, topicId, fromChatId);
    isNewTopic = true;
  }

  const isTopicExists = await (async function () {
    const reopenForumTopicResp = await (await postToTelegramApi(botToken, 'editForumTopic', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      name: topicName,
    })).json();
    return reopenForumTopicResp.ok || !reopenForumTopicResp.description.includes("TOPIC_ID_INVALID");
  })()

  // topic has been banned
  if (bannedTopics.includes(topicId) && isTopicExists) {
    return { success: false }
  }

  if (!isTopicExists) {
    // clean metadata message
    await cleanItemOnMetaData(botToken, metaDataMessage, ownerUid, topicId);
    fromChatToTopic.delete(fromChatId)
    // resend the message
    return await processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName)
  }

  // forwardMessage to topic
  const forwardMessageResp = await (await postToTelegramApi(botToken, 'forwardMessage', {
    chat_id: superGroupChatId,
    message_thread_id: topicId,
    from_chat_id: fromChatId,
    message_id: pmMessageId,
  })).json();

  if (forwardMessageResp.ok) {
    const topicMessageId = forwardMessageResp.result.message_id;

    // replay
    const replayPmMsgId = message.reply_to_message?.message_id
    if (replayPmMsgId) {
      const checkMessageConnectionMetaDataResp =
          await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
              `找不到原始消息进行编辑。`, ownerUid);
      let replayedMessageId;
      const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText?.split(';');
      if (messageConnectionTextSplit) {
        for (let i = 0; i < messageConnectionTextSplit.length; i++) {
          const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
          if (replayPmMsgId === parseInt(messageConnectionTextSplitSplit[1])) {
            const topicMessageMetaData = messageConnectionTextSplitSplit[0];
            const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
            replayedMessageId = parseInt(topicMessageMetaDataSplit[1]);
            break;
          }
        }
      }

      let newMessageLink = `https://t.me/c/${superGroupChatId}/${topicId}/${topicMessageId}`;
      if (superGroupChatId.toString().startsWith("-100")) {
        newMessageLink = `https://t.me/c/${superGroupChatId.toString().substring(4)}/${topicId}/${topicMessageId}`;
      }
      let text = `*⬆️⬆️⬆️[回复](${newMessageLink})⬆️⬆️⬆️*`;
      const sendReplayMessageBody = {
        chat_id: superGroupChatId,
        message_thread_id: topicId,
        text: text,
        parse_mode: "MarkdownV2"
      };
      let sendMessageResp;
      if (replayedMessageId) {
        sendReplayMessageBody.reply_parameters = {
          message_id: replayedMessageId,
          chat_id: superGroupChatId
        }
        sendMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', sendReplayMessageBody)).json();
      }
      if (!sendMessageResp || !sendMessageResp?.ok) {
        delete sendReplayMessageBody.reply_parameters;
        const isReplaySender = message.reply_to_message?.from.id === fromUserId;
        sendReplayMessageBody.text = `*⬆️⬆️⬆️[回复](${newMessageLink})`;
        sendReplayMessageBody.text += isReplaySender ? ` 我的⬇️⬇️⬇️*` : ` 你的⬇️⬇️⬇️*`;
        if (message.reply_to_message?.date) {
          const formatted = dayjs.unix(message.reply_to_message?.date)
              .tz('Asia/Shanghai')
              .format('YYYY-MM-DD HH:mm:ss');
          sendReplayMessageBody.text += `\n*${parseMdReserveWord(formatted)}*`;
        }
        if (message.reply_to_message.text) {
          sendReplayMessageBody.text += `\n\`\`\`\n`;
          sendReplayMessageBody.text += message.reply_to_message.text
              .substring(0, 128)
              .replace(/`/g, '\\`');
          sendReplayMessageBody.text += `\n\`\`\``;
        } else {
          sendReplayMessageBody.text += `\n*❌❌❌未知❌❌❌*`;
        }
        await postToTelegramApi(botToken, 'sendMessage', sendReplayMessageBody)
      }
    }

    if (isNewTopic) {
      // send PM to bot owner for the bad notification on super group for first message
      let messageLink = `https://t.me/c/${superGroupChatId}/${topicId}/${topicMessageId}`;
      if (superGroupChatId.toString().startsWith("-100")) {
        messageLink = `https://t.me/c/${superGroupChatId.toString().substring(4)}/${topicId}/${topicMessageId}`
      }
      const parsedFromChatName = parseMdReserveWord(fromChatName)
      const text = `${messageLink
          ? `来自 ${parsedFromChatName} 的新私信` +
          `\n[点击此处在你的超级群组中查看](${messageLink})`
          : `来自 ${parsedFromChatName} 的新私信` +
          `\n请到你的超级群组中查看`}`
      const sendMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: text,
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
      })).json();
      if (!sendMessageResp.ok) {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `新私信通知出错，内容：${text} 响应：${JSON.stringify(sendMessageResp)}`,
        })
      }
    }
    // save messageId connection to superGroupChat pin message
    await saveMessageConnection(botToken, superGroupChatId, topicId, topicMessageId, pmMessageId, ownerUid);
    // notify sending status by MessageReaction
    await postToTelegramApi(botToken, 'setMessageReaction', {
      chat_id: fromChatId,
      message_id: pmMessageId,
      reaction: [{ type: "emoji", emoji: "🕊" }]
    });
    return {
      success: true,
      targetChatId: superGroupChatId,
      targetTopicId: topicId,
      originChatId: fromChatId,
      originMessageId: pmMessageId,
      newMessageId: topicMessageId
    }
  } else if (forwardMessageResp.description.includes('message thread not found')) {
    // clean metadata message
    await cleanItemOnMetaData(botToken, metaDataMessage, ownerUid, topicId);
    fromChatToTopic.delete(fromChatId)
    // resend the message
    return await processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName)
  }
  return { success: false }
}

export async function processPMSent(botToken, message, topicToFromChat, noReplay) {
  const ownerUid = message.from.id;
  const topicId = message.message_thread_id;
  const superGroupChatId = message.chat.id;
  const topicMessageId = message.message_id;
  const pmChatId = topicToFromChat.get(message.message_thread_id)

  // replay
  let replayPmMessageId;
  let replayText;
  if (!noReplay && message.reply_to_message && message.reply_to_message?.message_id !== topicId) {
    replayText = message.reply_to_message?.text;
    const checkMessageConnectionMetaDataResp =
        await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
            `找不到目标消息进行回复。`, ownerUid);
    if (!checkMessageConnectionMetaDataResp.failed) {
      const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
      for (let i = 0; i < messageConnectionTextSplit.length; i++) {
        const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
        const topicMessageMetaData = messageConnectionTextSplitSplit[0];
        const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
        if (message.reply_to_message?.message_id === parseInt(topicMessageMetaDataSplit[1])) {
          replayPmMessageId = messageConnectionTextSplitSplit[1];
          break;
        }
      }
    }
  }

  const copyMessageBody = {
    chat_id: pmChatId,
    from_chat_id: superGroupChatId,
    message_id: topicMessageId
  };
  if (replayPmMessageId) {
    copyMessageBody.reply_parameters = {
      message_id: replayPmMessageId,
      chat_id: pmChatId
    }
  }
  const copyMessageResp = await (await postToTelegramApi(botToken, 'copyMessage', copyMessageBody)).json();
  if (copyMessageResp.ok) {
    const pmMessageId = copyMessageResp.result.message_id
    // save messageId connection to group pin message
    await saveMessageConnection(botToken, superGroupChatId, topicId, topicMessageId, pmMessageId, ownerUid);
    // send replay message
    if (!replayPmMessageId && replayText) {
      let sendReplayText = `*⬆️⬆️⬆️回复`;
      const isReplaySender = message.reply_to_message?.from.id === ownerUid;
      sendReplayText += isReplaySender ? ` 我的⬇️⬇️⬇️*` : ` 你的⬇️⬇️⬇️*`;
      if (message.reply_to_message?.date) {
        const formatted = dayjs.unix(message.reply_to_message?.date)
            .tz('Asia/Shanghai')
            .format('YYYY-MM-DD HH:mm:ss');
        sendReplayText += `\n*${parseMdReserveWord(formatted)}*`;
      }
      const replayTextLines = replayText.split('\n');
      for (const replayTextLine of replayTextLines) {
        sendReplayText += `\n>${parseMdReserveWord(replayTextLine)}`;
      }
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: pmChatId,
        text: sendReplayText,
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
      })
    }
    // notify sending status by MessageReaction
    await postToTelegramApi(botToken, 'setMessageReaction', {
      chat_id: superGroupChatId,
      message_id: topicMessageId,
      reaction: [{ type: "emoji", emoji: "🕊" }]
    });
  } else if (copyMessageResp.description.includes("message to be replied not found") || copyMessageResp.description.includes("repl")) {
    await processPMSent(botToken, message, topicToFromChat, true);
  } else {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `发送消息出错！copyMessageResp: ${JSON.stringify(copyMessageResp)} message: ${JSON.stringify(message)}`,
    });
  }
}

// ---------------------------------------- MESSAGE CONNECTION ----------------------------------------

async function checkMessageConnectionMetaData(botToken, superGroupChatId, failedMessage, failed) {
  let metaDataMessageId;
  let metaDataMessageText;
  let metaDataMessage;
  failedMessage = failedMessage || '';
  failed = failed || false;
  const checkMetaDataMessageResp = await (await postToTelegramApi(botToken, 'getChat', {
    chat_id: superGroupChatId,
  })).json();
  if (!checkMetaDataMessageResp.ok || !checkMetaDataMessageResp.result.pinned_message?.text) {
    failedMessage += " checkMetaDataMessageResp: " + JSON.stringify(checkMetaDataMessageResp);
    failed = true;
  } else {
    metaDataMessage = checkMetaDataMessageResp.result.pinned_message;
    metaDataMessageId = checkMetaDataMessageResp.result.pinned_message.message_id;
    metaDataMessageText = checkMetaDataMessageResp.result.pinned_message.text;
  }
  return { failedMessage, failed, metaDataMessageId, metaDataMessageText, metaDataMessage };
}

async function checkMessageConnectionMetaDataForAction(botToken, superGroupChatId, failedMessage, failedMessageChatId) {
  const checkMessageConnectionMetaDataResp = await checkMessageConnectionMetaData(
      botToken, superGroupChatId, failedMessage);
  if (checkMessageConnectionMetaDataResp.failed) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: failedMessageChatId,
      text: failedMessage,
    });
  }
  return checkMessageConnectionMetaDataResp;
}

async function saveMessageConnection(botToken, superGroupChatId, topicId, topicMessageId, pmMessageId, ownerUid) {
  let failed = false;
  let failedMessage = "Chat message connect failed, can't do emoji react, edit, delete.";
  const checkMessageConnectionMetaDataResp = await checkMessageConnectionMetaData(
      botToken, superGroupChatId, failedMessage, failed);
  failedMessage = checkMessageConnectionMetaDataResp.failedMessage;
  failed = checkMessageConnectionMetaDataResp.failed;
  let metaDataMessageId = checkMessageConnectionMetaDataResp.metaDataMessageId;
  let metaDataMessageText = checkMessageConnectionMetaDataResp.metaDataMessageText;
  if (failed) {
    // new message connection in superGroupChat pinned message
    failed = false;
    metaDataMessageText = `${topicId}-${topicMessageId}:${pmMessageId}`;
    const sendMetaDataMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      text: metaDataMessageText,
    })).json();
    if (!sendMetaDataMessageResp.ok) {
      failedMessage += " sendMetaDataMessageResp: " + JSON.stringify(sendMetaDataMessageResp);
      failed = true;
    }
    if (!failed) {
      metaDataMessageId = sendMetaDataMessageResp.result.message_id;
      const pinMetaDataMessageResp = await (await postToTelegramApi(botToken, 'pinChatMessage', {
        chat_id: superGroupChatId,
        message_id: metaDataMessageId,
      })).json();
      if (!pinMetaDataMessageResp.ok) {
        failedMessage += " pinMetaDataMessageResp: " + JSON.stringify(pinMetaDataMessageResp);
        failed = true;
      }
    }
  } else {
    // add message connection in superGroupChat pinned message
    metaDataMessageText = `${metaDataMessageText};${topicId}-${topicMessageId}:${pmMessageId}`;
    // text message max length 4096
    const processForTextMessageMaxLength = function (text, process) {
      if (text.length > 4096) {
        text = process(text);
        text = processForTextMessageMaxLength(text, process);
      }
      return text;
    }
    metaDataMessageText = processForTextMessageMaxLength(
        metaDataMessageText, (metaDataMessageText) => metaDataMessageText.split(';').slice(1).join(';'));
    const editMessageTextResp = await (await postToTelegramApi(botToken, 'editMessageText', {
      chat_id: superGroupChatId,
      message_id: metaDataMessageId,
      text: metaDataMessageText,
    })).json();
    if (!editMessageTextResp.ok) {
      failedMessage += " editMessageTextResp: " + JSON.stringify(editMessageTextResp);
      failed = true;
    }
  }
  if (failed) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `GROUP ${superGroupChatId} MESSAGE ${topicId}-${topicMessageId}:${pmMessageId}: ${failedMessage}`,
    });
  }
}

// ---------------------------------------- EMOJI REACTION ----------------------------------------

export async function processERReceived(botToken, ownerUid, fromUser, messageReaction, superGroupChatId, bannedTopics) {
  const pmMessageId = messageReaction.message_id;
  let topicId;
  let topicMessageId;
  let reaction = messageReaction.new_reaction;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId, "无法发送表情反应。", ownerUid);
  if (checkMessageConnectionMetaDataResp.failed) return;

  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
  for (let i = 0; i < messageConnectionTextSplit.length; i++) {
    const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
    if (pmMessageId === parseInt(messageConnectionTextSplitSplit[1])) {
      const topicMessageMetaData = messageConnectionTextSplitSplit[0];
      const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
      topicId = parseInt(topicMessageMetaDataSplit[0]);
      topicMessageId = parseInt(topicMessageMetaDataSplit[1]);
      break;
    }
  }

  if (bannedTopics.includes(topicId)) return;

  if (!topicMessageId) {
    return;
  }

  if (reaction.length === 0 && fromUser.id === ownerUid) {
    reaction = [
      {
        "type": "emoji",
        "emoji": "🕊"
      }
    ]
  }

  await sendEmojiReaction(botToken, superGroupChatId, topicMessageId, reaction, ownerUid);
}

export async function processERSent(botToken, messageReaction, topicToFromChat) {
  const ownerUid = messageReaction.user.id;
  const superGroupChatId = messageReaction.chat.id;
  let topicId;
  const topicMessageId = messageReaction.message_id;
  let pmChatId;
  let pmMessageId;
  let reaction = messageReaction.new_reaction;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId, "无法发送表情反应。", ownerUid);
  if (checkMessageConnectionMetaDataResp.failed) return;

  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
  for (let i = 0; i < messageConnectionTextSplit.length; i++) {
    const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
    const topicMessageMetaData = messageConnectionTextSplitSplit[0];
    const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
    if (topicMessageId === parseInt(topicMessageMetaDataSplit[1])) {
      topicId = topicMessageMetaDataSplit[0];
      pmMessageId = messageConnectionTextSplitSplit[1];
      pmChatId = topicToFromChat.get(parseInt(topicId));
      break;
    }
  }

  if (!pmMessageId) {
    return;
  }

  // TODO: 2025/5/10 if react on owner's message, there's no need for a 🕊
  if (reaction.length === 0) {
    reaction = [
      {
        "type": "emoji",
        "emoji": "🕊"
      }
    ]
  }

  await sendEmojiReaction(botToken, pmChatId, pmMessageId, reaction, ownerUid);
}

async function sendEmojiReaction(botToken, targetChatId, targetMessageId, reaction, ownerUid) {
  const setMessageReactionResp = await (await postToTelegramApi(botToken, 'setMessageReaction', {
    chat_id: targetChatId,
    message_id: targetMessageId,
    reaction: reaction
  })).json();
  if (!setMessageReactionResp.ok) {
    if (setMessageReactionResp.description.includes('REACTIONS_TOO_MANY')) {
      await postToTelegramApi(botToken, 'setMessageReaction', {
        chat_id: targetChatId,
        message_id: targetMessageId,
        reaction: reaction.slice(-1)
      });
    } else if (setMessageReactionResp.description.includes('REACTION_INVALID')) {
    } else {
      // --- for debugging ---
      // await postToTelegramApi(botToken, 'sendMessage', {
      //   chat_id: ownerUid,
      //   text: `setMessageReactionResp : ${JSON.stringify(setMessageReactionResp)}`,
      // });
      // --- for debugging ---
    }
  }
}

// ---------------------------------------- EDIT MESSAGE ----------------------------------------

export async function processPMEditReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName) {
  const { success: isForwardSuccess, targetChatId, targetTopicId, originChatId, originMessageId, newMessageId } =
      await processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName)
  if (isForwardSuccess) {
    const checkMessageConnectionMetaDataResp =
        await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
            `找不到原始消息进行编辑。`, ownerUid);

    let newMessageLink = `https://t.me/c/${targetChatId}/${targetTopicId}/${newMessageId}`;
    if (targetChatId.toString().startsWith("-100")) {
      newMessageLink = `https://t.me/c/${targetChatId.toString().substring(4)}/${targetTopicId}/${newMessageId}`;
    }

    let oldMessageId;
    let oldMessageLink;
    const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText?.split(';');
    if (messageConnectionTextSplit) {
      for (let i = 0; i < messageConnectionTextSplit.length; i++) {
        const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
        if (originMessageId === parseInt(messageConnectionTextSplitSplit[1])) {
          const topicMessageMetaData = messageConnectionTextSplitSplit[0];
          const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
          oldMessageId = parseInt(topicMessageMetaDataSplit[1]);
          break;
        }
      }
      oldMessageLink = oldMessageId ? `https://t.me/c/${targetChatId}/${targetTopicId}/${oldMessageId}` : '';
      if (oldMessageId && targetChatId.toString().startsWith("-100")) {
        oldMessageLink = `https://t.me/c/${targetChatId.toString().substring(4)}/${targetTopicId}/${oldMessageId}`;
      }
    }

    let text = `⬆️⬆️⬆️⬆️⬆️⬆️`;
    if (oldMessageLink) {
      text += `\n*[消息](${newMessageLink}) 已从 [消息](${oldMessageLink}) 编辑*`;
    } else {
      text += `\n*[消息](${newMessageLink}) 从未知消息编辑*`;
    }
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: targetChatId,
      message_thread_id: targetTopicId,
      text: text,
      parse_mode: "MarkdownV2",
    });
    await notifyMessageEditForward(botToken, originChatId, originMessageId);
  }
}

export async function processPMEditSent(botToken, message, superGroupChatId, topicToFromChat) {
  const ownerUid = message.from.id;
  const topicId = message.message_thread_id;
  const topicMessageId = message.message_id;
  const pmChatId = topicToFromChat.get(message.message_thread_id);
  let pmMessageId;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
          `找不到目标消息进行编辑。`, ownerUid);
  if (checkMessageConnectionMetaDataResp.failed) return;

  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
  for (let i = 0; i < messageConnectionTextSplit.length; i++) {
    const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
    const topicMessageMetaData = messageConnectionTextSplitSplit[0];
    const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
    if (topicMessageId === parseInt(topicMessageMetaDataSplit[1])) {
      pmMessageId = messageConnectionTextSplitSplit[1];
      break;
    }
  }

  let oldMessageLink = `https://t.me/c/${superGroupChatId}/${topicId}/${topicMessageId}`;
  if (superGroupChatId.toString().startsWith("-100")) {
    oldMessageLink = `https://t.me/c/${superGroupChatId.toString().substring(4)}/${topicId}/${topicMessageId}`;
  }
  if (!pmMessageId) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      text: `找不到目标消息编辑 [消息](${oldMessageLink})\\。`,
      parse_mode: "MarkdownV2",
    });
    return;
  }

  if (message.text) {
    const editMessageTextResp = await (await postToTelegramApi(botToken, 'editMessageText', {
      chat_id: pmChatId,
      message_id: pmMessageId,
      text: message.text,
      parse_mode: message.parse_mode,
      entities: message.entities,
    })).json();
    if (editMessageTextResp.ok) {
      // notify sending status by MessageReaction
      await notifyMessageEditForward(botToken, superGroupChatId, topicMessageId);
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `发送编辑消息出错！editMessageTextResp: ${JSON.stringify(editMessageTextResp)} message: ${JSON.stringify(message)}.` +
            `\n你可以把这个信息发给开发者寻求帮助，或直接删除这条消息。`,
      });
    }
  } else if (false) {
    // TODO: 2025/5/10 editMessageCaption
  } else if (false) {
    // TODO: 2025/5/10 editMessageMedia
  } else if (false) {
    // TODO: 2025/5/10 editMessageLiveLocation
  } else if (false) {
    // TODO: 2025/5/10 stopMessageLiveLocation
  }
}

async function notifyMessageEditForward(botToken, fromChatId, fromMessageId) {
  await postToTelegramApi(botToken, 'setMessageReaction', {
    chat_id: fromChatId,
    message_id: fromMessageId,
    reaction: [{ type: "emoji", emoji: "🦄" }]
  });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await postToTelegramApi(botToken, 'setMessageReaction', {
    chat_id: fromChatId,
    message_id: fromMessageId,
    reaction: [{ type: "emoji", emoji: "🕊" }]
  });
}

// ---------------------------------------- DELETE MESSAGE ----------------------------------------

export async function processPMDeleteReceived(botToken, ownerUid, message, reply,
                                              superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage) {
  const commandMessageId = message.message_id;
  const targetChatId = superGroupChatId;
  const originMessageId = reply.message_id;
  const fromChat = message.chat;
  const fromChatId = fromChat.id;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
          `找不到原始消息进行删除。`, ownerUid);

  let targetMessageId;
  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText?.split(';');
  if (messageConnectionTextSplit) {
    for (let i = 0; i < messageConnectionTextSplit.length; i++) {
      const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
      if (originMessageId === parseInt(messageConnectionTextSplitSplit[1])) {
        const topicMessageMetaData = messageConnectionTextSplitSplit[0];
        const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
        targetMessageId = parseInt(topicMessageMetaDataSplit[1]);
        break;
      }
    }
  }

  if (message.text) {
    const deleteMessageResp = await (await postToTelegramApi(botToken, 'deleteMessage', {
      chat_id: targetChatId,
      message_id: targetMessageId,
    })).json();
    if (deleteMessageResp.ok) {
      await notifyMessageDeleteForward(botToken, fromChatId, originMessageId, commandMessageId);
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: fromChatId,
        text: `发送删除消息出错！deleteMessageResp: ${JSON.stringify(deleteMessageResp)} message: ${JSON.stringify(message)}.` +
            `\n你可以把这个信息发给开发者寻求帮助，或直接删除这条消息。`,
      });
    }
  }
}

export async function processPMDeleteSent(botToken, message, reply, superGroupChatId, topicToFromChat) {
  const ownerUid = message.from.id;
  const commandMessageId = message.message_id;
  const topicId = message.message_thread_id;
  const deleteOriginMessageId = reply.message_id;
  const pmChatId = topicToFromChat.get(message.message_thread_id);
  let deleteTargetMessageId;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
          `找不到目标消息进行删除。`, ownerUid);
  if (checkMessageConnectionMetaDataResp.failed) return;

  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
  for (let i = 0; i < messageConnectionTextSplit.length; i++) {
    const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
    const topicMessageMetaData = messageConnectionTextSplitSplit[0];
    const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
    if (deleteOriginMessageId === parseInt(topicMessageMetaDataSplit[1])) {
      deleteTargetMessageId = messageConnectionTextSplitSplit[1];
      break;
    }
  }

  let originMessageLink = `https://t.me/c/${superGroupChatId}/${topicId}/${deleteOriginMessageId}`;
  if (superGroupChatId.toString().startsWith("-100")) {
    originMessageLink = `https://t.me/c/${superGroupChatId.toString().substring(4)}/${topicId}/${deleteOriginMessageId}`;
  }
  if (!deleteTargetMessageId) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      text: `找不到目标消息删除 [消息](${originMessageLink})\\。`,
      parse_mode: "MarkdownV2",
    });
    return;
  }

  if (message.text) {
    const deleteMessageResp = await (await postToTelegramApi(botToken, 'deleteMessage', {
      chat_id: pmChatId,
      message_id: deleteTargetMessageId,
    })).json();
    if (deleteMessageResp.ok) {
      await notifyMessageDeleteForward(botToken, superGroupChatId, deleteOriginMessageId, commandMessageId, topicId);
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: superGroupChatId,
        message_thread_id: topicId,
        text: `发送删除消息出错！deleteMessageResp: ${JSON.stringify(deleteMessageResp)} message: ${JSON.stringify(message)}.` +
            `\n你可以把这个信息发给开发者寻求帮助，或直接删除这条消息。`,
      });
    }
  }
}

async function notifyMessageDeleteForward(botToken, fromChatId, fromMessageId, commandMessageId, fromTopicId) {
  await postToTelegramApi(botToken, 'setMessageReaction', {
    chat_id: fromChatId,
    message_id: commandMessageId,
    reaction: [{ type: "emoji", emoji: "🗿" }]
  });
  if (fromTopicId) {
    let originMessageLink = `https://t.me/c/${fromChatId}/${fromTopicId ? `${fromTopicId}/` : ''}${fromMessageId}`;
    if (fromChatId.toString().startsWith("-100")) {
      originMessageLink = `https://t.me/c/${fromChatId.toString().substring(4)}/${fromTopicId ? `${fromTopicId}/` : ''}${fromMessageId}`;
    }
    let commandMessageLink = `https://t.me/c/${fromChatId}/${fromTopicId ? `${fromTopicId}/` : ''}${commandMessageId}`;
    if (fromChatId.toString().startsWith("-100")) {
      commandMessageLink = `https://t.me/c/${fromChatId.toString().substring(4)}/${fromTopicId ? `${fromTopicId}/` : ''}${commandMessageId}`;
    }
    const sendMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: fromChatId,
      message_thread_id: fromTopicId,
      text: `*[消息](${originMessageLink}) 已从 [消息](${originMessageLink}) 编辑*\\.` +
          `这三条消息将在1秒后自动删除\\.` +
          `\n或者你可以自行删除 *[原始消息](${originMessageLink})*` +
          ` 和 *[命令消息](${commandMessageLink})*` +
          ` 以及 *\\[本消息\\]*。`,
      parse_mode: "MarkdownV2",
    })).json();
    if (sendMessageResp.ok) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      // delete origin message
      await postToTelegramApi(botToken, 'deleteMessage', {
        chat_id: fromChatId,
        message_id: fromMessageId,
      });
      // delete command message
      await postToTelegramApi(botToken, 'deleteMessage', {
        chat_id: fromChatId,
        message_id: commandMessageId,
      });
      await postToTelegramApi(botToken, 'deleteMessage', {
        chat_id: fromChatId,
        message_id: sendMessageResp.result.message_id,
      });
    }
  } else {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: fromChatId,
      message_thread_id: fromTopicId,
      text: `*消息已被删除*\\.` +
          `\n你可以自行删除 *\\[原始消息\\]*` +
          ` 和 *\\[命令消息\\]*` +
          ` 以及 *\\[本消息\\]*\\。`,
      parse_mode: "MarkdownV2",
    });
  }
}

// ---------------------------------------- DELETE ALL MESSAGES ----------------------------------------

async function getAllTopicMappings(botToken, superGroupChatId, targetTopicId) {
  const checkMessageConnectionMetaDataResp = await checkMessageConnectionMetaData(
      botToken, superGroupChatId, "无法获取消息映射关系。");
  
  if (checkMessageConnectionMetaDataResp.failed || !checkMessageConnectionMetaDataResp.metaDataMessageText) {
    return [];
  }

  const mappings = [];
  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';');

  for (const connection of messageConnectionTextSplit) {
    if (!connection.trim()) continue;
    
    const connectionParts = connection.split(':');
    if (connectionParts.length !== 2) continue;
    
    const topicPart = connectionParts[0];
    const pmMessageId = connectionParts[1];
    
    const topicParts = topicPart.split('-');
    if (topicParts.length !== 2) continue;
    
    const topicId = parseInt(topicParts[0]);
    const topicMessageId = parseInt(topicParts[1]);
    const pmMsgId = parseInt(pmMessageId);
    
    if (topicId === targetTopicId && !isNaN(topicMessageId) && !isNaN(pmMsgId)) {
      mappings.push({
        topicId: topicId,
        topicMessageId: topicMessageId,
        pmMessageId: pmMsgId
      });
    }
  }

  return mappings;
}

async function cleanAllTopicMappingsFromMetaData(botToken, superGroupChatId, targetTopicId, ownerUid) {
  const checkMessageConnectionMetaDataResp = await checkMessageConnectionMetaData(
      botToken, superGroupChatId, "无法清理映射关系。");
  
  if (checkMessageConnectionMetaDataResp.failed) {
    return { success: false };
  }

  const oldText = checkMessageConnectionMetaDataResp.metaDataMessageText;
  const messageConnectionTextSplit = oldText.split(';');
  
  // 过滤掉目标话题的所有映射关系
  const filteredConnections = messageConnectionTextSplit.filter(connection => {
    if (!connection.trim()) return false;
    
    const connectionParts = connection.split(':');
    if (connectionParts.length !== 2) return true;
    
    const topicPart = connectionParts[0];
    const topicParts = topicPart.split('-');
    if (topicParts.length !== 2) return true;
    
    const topicId = parseInt(topicParts[0]);
    return topicId !== targetTopicId;
  });

  const newText = filteredConnections.join(';');
  
  try {
    const editMessageTextResp = await (await postToTelegramApi(botToken, 'editMessageText', {
      chat_id: superGroupChatId,
      message_id: checkMessageConnectionMetaDataResp.metaDataMessageId,
      text: newText,
    })).json();
    
    return { success: editMessageTextResp.ok };
  } catch (error) {
    return { success: false };
  }
}

export async function processPMDeleteAllSent(botToken, message, superGroupChatId, topicToFromChat) {
  const ownerUid = message.from.id;
  const commandMessageId = message.message_id;
  const topicId = message.message_thread_id;
  const pmChatId = topicToFromChat.get(topicId);

  if (!pmChatId) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      text: `找不到对应的私聊用户，无法执行批量删除！`,
    });
    return;
  }

  // 发送开始提示
  const startMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: superGroupChatId,
    message_thread_id: topicId,
    text: `开始批量删除当前话题的所有消息...`,
  })).json();

  // 获取该话题的所有映射关系
  const mappings = await getAllTopicMappings(botToken, superGroupChatId, topicId);
  
  if (mappings.length === 0) {
    await postToTelegramApi(botToken, 'editMessageText', {
      chat_id: superGroupChatId,
      message_id: startMessageResp.result.message_id,
      text: `当前话题没有找到可删除的消息映射关系！`,
    });
    return;
  }

  let deletedCount = 0;
  let failedCount = 0;
  const totalCount = mappings.length;

  // 批量删除消息
  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    let topicDeleted = false;
    let pmDeleted = false;

    try {
      // 删除话题中的消息
      const deleteTopicMessageResp = await (await postToTelegramApi(botToken, 'deleteMessage', {
        chat_id: superGroupChatId,
        message_id: mapping.topicMessageId,
      })).json();
      topicDeleted = deleteTopicMessageResp.ok;
    } catch (error) {
      // 忽略删除失败的情况
    }

    try {
      // 删除私聊中的消息
      const deletePmMessageResp = await (await postToTelegramApi(botToken, 'deleteMessage', {
        chat_id: pmChatId,
        message_id: mapping.pmMessageId,
      })).json();
      pmDeleted = deletePmMessageResp.ok;
    } catch (error) {
      // 忽略删除失败的情况
    }

    if (topicDeleted || pmDeleted) {
      deletedCount++;
    } else {
      failedCount++;
    }

    // 每删除10条消息更新一次进度
    if ((i + 1) % 10 === 0 || i === mappings.length - 1) {
      await postToTelegramApi(botToken, 'editMessageText', {
        chat_id: superGroupChatId,
        message_id: startMessageResp.result.message_id,
        text: `正在批量删除消息... ${i + 1}/${totalCount}\n` +
              `已删除: ${deletedCount} 条\n` +
              `失败: ${failedCount} 条`,
      });
    }

    // 避免API速率限制，每条消息之间暂停100ms
    if (i < mappings.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // 清理置顶消息中的映射关系
  const cleanResult = await cleanAllTopicMappingsFromMetaData(botToken, superGroupChatId, topicId, ownerUid);

  // 发送完成通知
  const finalText = `✅ 批量删除完成！\n\n` +
                   `📊 统计信息：\n` +
                   `• 总共处理: ${totalCount} 条消息\n` +
                   `• 成功删除: ${deletedCount} 条\n` +
                   `• 删除失败: ${failedCount} 条\n` +
                   `• 映射清理: ${cleanResult.success ? '成功' : '失败'}\n\n` +
                   `🗑️ 当前话题的消息映射关系已清理，新消息将重新建立映射关系。`;

  await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: superGroupChatId,
    message_id: startMessageResp.result.message_id,
    text: finalText,
  });

  // 给命令消息添加 🗿 表情反馈
  await postToTelegramApi(botToken, 'setMessageReaction', {
    chat_id: superGroupChatId,
    message_id: commandMessageId,
    reaction: [{ type: "emoji", emoji: "🗿" }]
  });
}

// ---------------------------------------- BAN TOPIC ----------------------------------------

export async function banTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, isSilent) {
  const topicId = message.message_thread_id;
  const superGroupChatId = message.chat.id;

  const { isBannedBefore } =
      await banTopicOnMetaData(botToken, ownerUid, metaDataMessage, topicId);
  if (isBannedBefore) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      text: `这个话题已经被屏蔽了！`,
    });
    return new Response('OK');
  }

  await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: superGroupChatId,
    message_thread_id: topicId,
    text: `成功屏蔽此话题，不再接收私信！`,
  });

  if (isSilent) return new Response('OK');
  const chatId = topicToFromChat.get(topicId)
  await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: `你已被屏蔽，无法发送消息！`,
  });
  return new Response('OK');
}

export async function unbanTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, isSilent) {
  const topicId = message.message_thread_id;
  const superGroupChatId = message.chat.id;

  const { isNotBannedBefore } =
      await unbanTopicOnMetaData(botToken, ownerUid, metaDataMessage, topicId);
  if (isNotBannedBefore) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      text: `这个话题没有被屏蔽！`,
    });
    return new Response('OK');
  }

  await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: superGroupChatId,
    message_thread_id: topicId,
    text: `成功取消屏蔽此话题，可以接收私信！`,
  });

  if (isSilent) return new Response('OK');
  const chatId = topicToFromChat.get(topicId)
  await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: `你已被解除屏蔽，可以发送消息！`,
  });
  return new Response('OK');
}

// ---------------------------------------- FIX SETTING ----------------------------------------

export async function fixPinMessage(botToken, chatId, text, oldPinMsgId) {
  await postToTelegramApi(botToken, 'unpinChatMessage', {
    chat_id: chatId,
    message_id: oldPinMsgId,
  });

  const sendMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: text,
  })).json();
  if (sendMessageResp.ok) {
    await postToTelegramApi(botToken, 'pinChatMessage', {
      chat_id: chatId,
      message_id: sendMessageResp.result.message_id,
    });
  }
}

// ---------------------------------------- TOPIC COMMENT NAME ----------------------------------------

export async function processTopicCommentNameEdit(botToken, ownerUid, topicId, fromChatId, newTotalName, metaDataMessage) {
  if (!newTotalName) return;
  const oldText = metaDataMessage.text;
  let commentName = newTotalName.includes('|') ?
      newTotalName.split('|')[0].trim().replace(/[:;]/g, '') : '';

  const escapeRegExp = str => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const checkRegex = new RegExp(`;${topicId}:b?${fromChatId}:${escapeRegExp(commentName)}(?:[;^])`, 'g');
  const isMatch = checkRegex.test(oldText);
  if (isMatch) {
    return;
  }
  const replaceRegex = new RegExp(`;${topicId}:(b?)${fromChatId}(?::[^;]*)?`, 'g');
  const newText = oldText.replace(replaceRegex, `;${topicId}:$1${fromChatId}:${commentName}`);
  await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  });
}
