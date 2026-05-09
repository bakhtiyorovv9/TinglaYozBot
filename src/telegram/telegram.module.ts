import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { VoiceModule } from '../voice/voice.module';

@Module({
  imports: [VoiceModule],
  providers: [TelegramUpdate],
})
export class TelegramModule {}
