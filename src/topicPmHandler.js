import { allowed_updates, postToTelegramApi } from './core';

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
        await sendRespMessage(message.chat.id, `bot ${childBotToken} install success!`);
      } else {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} install failed! ${JSON.stringify(setWebhookResp)}`);
      }
    } else if (message.text.startsWith("/uninstall ")) {
      const childBotToken = message.text.split("/uninstall ")[1];
      const deleteWebhookResp = await (await postToTelegramApi(childBotToken, 'deleteWebhook', {})).json();
      if (deleteWebhookResp.ok) {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} uninstall success!`);
      } else {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} uninstall failed! ${JSON.stringify(deleteWebhookResp)}`);
      }
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: message.chat.id,
        text: `has no this command! Try '/install {{botToken}}' OR '/uninstall {{botToken}}'`,
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
    let failedMessage = "init failed, please try again";
    let sendMetaDataMessageResp;
    let pinMetaDataMessageResp;

    const check = await doCheckInit(botToken, ownerUid)
    if (!check.failed) {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: "already init!",
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
    failedMessage = failedMessage || "init check failed, please do init or try again";
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
        text: `GROUP ${supergroupId}: ${failedMessage}`,
      });
    } else {
      const { superGroupChatId: superGroupIdFromMetaDataMessage }
          = parseMetaDataMessage(checkMetaDataMessageResp.result.pinned_message);
      if (superGroupIdFromMetaDataMessage !== supergroupId) {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `GROUP ${supergroupId}: init failed! Cause already init GROUP ${superGroupIdFromMetaDataMessage}`,
        });
      } else {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `GROUP ${supergroupId}: init success!`,
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
  }
  return { checkMetaDataMessageResp, failedMessage, failed };
}

export function parseMetaDataMessage(metaDataMessage) {
  const metaDataSplit = metaDataMessage.text.split(";")
  let superGroupChatId = parseInt(metaDataSplit[0]);
  let topicToFromChat = new Map;
  let fromChatToTopic = new Map;
  if (metaDataSplit.length > 1) {
    for (let i = 1; i < metaDataSplit.length; i++) {
      const topicToFromChatSplit = metaDataSplit[i].split(":");
      const topic = parseInt(topicToFromChatSplit[0]);
      const fromChat = parseInt(topicToFromChatSplit[1]);
      topicToFromChat.set(topic, fromChat);
      fromChatToTopic.set(fromChat, topic);
    }
  }
  return { superGroupChatId, topicToFromChat, fromChatToTopic };
}

export async function addTopicToFromChatOnMetaData(botToken, metaDataMessage, ownerUid, topicId, fromChatId) {
  const newText = `${metaDataMessage.text};${topicId}:${fromChatId}`
  await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  });
  return { newText };
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
            text: `Reset failed!`,
          });
        } else {
          await postToTelegramApi(botToken, 'sendMessage', {
            chat_id: ownerUid,
            text: `Reset success!`,
          });
        }
      } else {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `Can't reset from group isn't current using!`,
        });
      }
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: "not init yet!",
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

export async function processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, metaDataMessage) {
  const fromChat = message.chat;
  const fromChatId = fromChat.id;
  let topicId = fromChatToTopic.get(fromChatId);
  let isNewTopic = false;
  let fromChatName
  if (!topicId) {
    fromChatName = fromChat.username ?
        `@${fromChat.username}` : [fromChat.first_name, fromChat.last_name].filter(Boolean).join(' ');
    let topicName = `${fromChatName} ${fromChatId === message.from.id ? `(${fromChatId})` : `(${fromChatId})(${message.from.id})`}`
    const lengthCheckDo = function (topicName, newTopicName) {
      if (topicName.length > 128) {
        return newTopicName;
      } else {
        return topicName
      }
    }
    topicName = lengthCheckDo(topicName, `${fromChatName} (${fromChatId})`);
    topicName = lengthCheckDo(topicName, fromChatName);
    topicName = lengthCheckDo(topicName, fromChatName.substring(0, 127));
    const createTopicResp = await (await postToTelegramApi(botToken, 'createForumTopic', {
      chat_id: superGroupChatId,
      name: topicName,
    })).json();
    topicId = createTopicResp.result?.message_thread_id
    await addTopicToFromChatOnMetaData(botToken, metaDataMessage, ownerUid, topicId, fromChatId);
    isNewTopic = true;
  }

  // forwardMessage to topic
  const forwardMessageResp = await (await postToTelegramApi(botToken, 'forwardMessage', {
    chat_id: superGroupChatId,
    message_thread_id: topicId,
    from_chat_id: fromChat.id,
    message_id: message.message_id,
  })).json();
  if (forwardMessageResp.ok) {
    if (isNewTopic) {
      // send PM to bot owner for the bad notification on super group for first message
      let messageLink;
      if(superGroupChatId.toString().startsWith("-100")) {
        messageLink = `https://t.me/c/${superGroupChatId.toString().substring(4)}/${topicId}/${forwardMessageResp.result.message_id}`
      }
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `${messageLink
            ? `New PM chat from ${fromChatName}.\nClick the link below to view it in your PM_SUPERGROUP:\n${messageLink}`
            : `New PM chat from ${fromChatName}, Go view it in your PM_SUPERGROUP`}`,
      });
    }
    // notify sending status by MessageReaction
    await postToTelegramApi(botToken, 'setMessageReaction', {
      chat_id: fromChatId,
      message_id: message.message_id,
      reaction: [{ type: "emoji", emoji: "🕊" }]
    });
  }
}

export async function processPMSent(botToken, message, topicToFromChat) {
  const pmChatId = topicToFromChat.get(message.message_thread_id)
  const copyMessageResp = await (await postToTelegramApi(botToken, 'copyMessage', {
    chat_id: pmChatId,
    from_chat_id: message.chat.id,
    message_id: message.message_id
  })).json();
  if (copyMessageResp.ok) {
    // notify sending status by MessageReaction
    await postToTelegramApi(botToken, 'setMessageReaction', {
      chat_id: message.chat.id,
      message_id: message.message_id,
      reaction: [{ type: "emoji", emoji: "🕊" }]
    });
  }
}