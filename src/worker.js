/**
 * Open Wegram Bot - Cloudflare Worker Entry Point
 * A two-way private messaging Telegram bot
 *
 * GitHub Repository: https://github.com/wozulong/open-wegram-bot
 */

import { handleRequest } from './core.js';

export default {
    async fetch(request, env, ctx) {
        const config = {
            prefix: env.PREFIX || 'public',
            secretToken: env.SECRET_TOKEN || '',
            childBotUrl: env.CHILD_BOT_URL || '',
            childBotSecretToken: env.CHILD_BOT_SECRET_TOKEN || ''
        };

        return handleRequest(request, config);
    }
};