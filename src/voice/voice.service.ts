import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';
import axios from 'axios';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private hfToken: string;

  // O'zbek modellari ro'yxati — birinchisi ishlamasa keyingisini sinaydi
  private readonly models = [
    'islomov/navaistt_v2_medium',
    'islomov/navaistt_v1_medium',
    'oyqiz/uzbek_stt',
  ];

  constructor(private configService: ConfigService) {
    this.hfToken = this.configService.get('HF_TOKEN');
  }

  private async downloadFile(fileUrl: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      https.get(fileUrl, (res) => {
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
  }

  private convertToWav(inputPath: string, outputPath: string): void {
    execSync(
      `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}" -y`
    );
  }

  private async tryModel(model: string, audioBuffer: Buffer): Promise<string | null> {
    try {
      const response = await axios.post(
        `https://api-inference.huggingface.co/models/${model}`,
        audioBuffer,
        {
          headers: {
            'Authorization': `Bearer ${this.hfToken}`,
            'Content-Type': 'audio/wav',
          },
          maxBodyLength: Infinity,
          timeout: 120000,
        }
      );
      const text = response.data.text || response.data[0]?.text;
      if (text) {
        this.logger.log(`✅ Model "${model}" ishladi: ${text}`);
        return text;
      }
      return null;
    } catch (err: any) {
      this.logger.warn(`❌ Model "${model}" xato: ${err.response?.status} ${err.message}`);
      return null;
    }
  }

  async transcribe(fileUrl: string): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const id = Date.now();
    const oggPath = path.join(tempDir, `voice_${id}.ogg`);
    const wavPath = path.join(tempDir, `voice_${id}.wav`);

    try {
      this.logger.log('📥 Yuklanmoqda...');
      await this.downloadFile(fileUrl, oggPath);

      this.logger.log('🔄 WAV ga aylantirilmoqda...');
      this.convertToWav(oggPath, wavPath);

      const audioBuffer = fs.readFileSync(wavPath);

      this.logger.log('🤖 Modellarni sinab ko\'rish...');
      for (const model of this.models) {
        this.logger.log(`Sinash: ${model}`);
        const text = await this.tryModel(model, audioBuffer);
        if (text) return text;
      }

      throw new Error('Hech qaysi model ishlamadi');
    } finally {
      if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath);
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    }
  }
}
