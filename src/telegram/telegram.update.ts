import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { VoiceService } from '../voice/voice.service';

@Injectable()
export class TelegramUpdate implements OnModuleDestroy {
  private readonly logger = new Logger(TelegramUpdate.name);
  private bot: Telegraf;

  constructor(
    private configService: ConfigService,
    private voiceService: VoiceService,
  ) {
    this.bot = new Telegraf(
      this.configService.get<string>('TELEGRAM_BOT_TOKEN'),
    );
    this.registerHandlers();
    this.bot.launch();
    this.logger.log('✅ Bot ishga tushdi!');
  }

  private registerHandlers() {
    this.bot.start(async (ctx) => {
      await ctx.reply(
        '👋 Salom!\n\n' +
          "🎤 Menga o'zbek tilida ovozli xabar yuboring\n" +
          '📝 Men uni matnga aylantiraman!',
      );
    });

    this.bot.on('voice', async (ctx) => {
      const loading = await ctx.reply('⏳ Qayta ishlanmoqda...');
      try {
        const voice = (ctx.message as any).voice;
        const fileLink = await ctx.telegram.getFileLink(voice.file_id);
        const text = await this.voiceService.transcribe(fileLink.href);

        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loading.message_id,
          undefined,
          `📝 *Matn:*\n\n${text}\n\n_⏱ ${voice.duration} soniya_`,
          { parse_mode: 'Markdown' },
        );

        this.logger.log(`✅ ${voice.duration}s → "${text.slice(0, 50)}"`);
      } catch (err) {
        this.logger.error('❌ Xato:', err.message);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loading.message_id,
          undefined,
          "❌ Xato yuz berdi, qaytadan urinib ko'ring.",
        );
      }
    });

    this.bot.on('text', async (ctx) => {
      await ctx.reply('🎤 Ovozli xabar yuboring!');
    });
  }

  onModuleDestroy() {
    this.bot.stop('SIGTERM');
  }
}
