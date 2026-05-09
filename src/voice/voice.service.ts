import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private groq: OpenAI;

  constructor(private configService: ConfigService) {
    this.groq = new OpenAI({
      apiKey: this.configService.get('GROQ_API_KEY'),
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }

  private async downloadFile(fileUrl: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      https
        .get(fileUrl, (res) => {
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        })
        .on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
    });
  }

  private convertToMp3(inputPath: string, outputPath: string): void {
    execSync(`ffmpeg -i "${inputPath}" -f mp3 "${outputPath}" -y`);
  }

  async transcribe(fileUrl: string): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const id = Date.now();
    const oggPath = path.join(tempDir, `voice_${id}.ogg`);
    const mp3Path = path.join(tempDir, `voice_${id}.mp3`);

    try {
      this.logger.log('📥 Yuklanmoqda...');
      await this.downloadFile(fileUrl, oggPath);

      this.logger.log('🔄 Konvertatsiya...');
      this.convertToMp3(oggPath, mp3Path);

      this.logger.log('🤖 Groq Whisper ishlamoqda...');
      const result = await this.groq.audio.transcriptions.create({
        file: fs.createReadStream(mp3Path),
        model: 'whisper-large-v3-turbo', // ← yangi model
        response_format: 'text',
        prompt: "Salom, bu o'zbek tilida gapirilgan audio.",
      });

      return result as unknown as string;
    } finally {
      if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath);
      if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
    }
  }
}
