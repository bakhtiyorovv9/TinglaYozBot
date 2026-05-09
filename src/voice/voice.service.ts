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
      https.get(fileUrl, (res) => {
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
  }

  private convertToMp3(inputPath: string, outputPath: string): void {
    execSync(
      `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -af "volume=2.0,highpass=f=200,lowpass=f=3500" "${outputPath}" -y`
    );
  }

  private async transcribeWithWhisper(mp3Path: string): Promise<string> {
    const result = await this.groq.audio.transcriptions.create({
      file: fs.createReadStream(mp3Path),
      model: 'whisper-large-v3',
      language: 'uz',
      response_format: 'text',
      prompt: "Salom! Bu o'zbek tilida gap. Lotin alifbosida yozilsin. So'zlar: assalomu alaykum, rahmat, qalaysiz, yaxshi, men, sen, biz, ular, bugun, ertaga.",
    });
    return result as unknown as string;
  }

  private async correctWithLlama(rawText: string): Promise<string> {
    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Sen o'zbek tilidagi audio transkriptlarni tuzatish bo'yicha mutaxassissan. 
Sening vazifang — Whisper modeli tomonidan o'zbek tilidan noto'g'ri tanilgan matnni tuzatish.
QOIDALAR:
1. Faqat tuzatilgan o'zbek matnini qaytar, hech qanday qo'shimcha izoh yozma
2. Lotin alifbosida yoz (Cyrillic emas)
3. Inglizcha yoki ruscha so'zlar bo'lsa — ularni o'zbekcha ekvivalentiga o'zgartir agar shubha bo'lmasa
4. Tinish belgilarini to'g'ri qo'y
5. Agar matn allaqachon to'g'ri bo'lsa — o'zgartirmasdan qaytar
6. Agar matn umuman tushunarsiz bo'lsa — eng yaqin ma'noli o'zbekcha variantni taklif qil`,
        },
        {
          role: 'user',
          content: `Quyidagi xom transkriptni o'zbek tilida to'g'ri matnga aylantir:\n\n"${rawText}"`,
        },
      ],
      temperature: 0.3,
    });
    return completion.choices[0].message.content || rawText;
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

      this.logger.log('🎤 Whisper ishlamoqda...');
      const rawText = await this.transcribeWithWhisper(mp3Path);
      this.logger.log(`Whisper: "${rawText}"`);

      this.logger.log('🧠 Llama tuzatmoqda...');
      const correctedText = await this.correctWithLlama(rawText);
      this.logger.log(`Llama: "${correctedText}"`);

      return correctedText;
    } finally {
      if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath);
      if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
    }
  }
}
