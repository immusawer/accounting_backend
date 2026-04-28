import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import * as os from 'os';

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_LOCAL_IP_URL,
    [],
  ];
  console.log(process.env.FRONTEND_URL, process.env.FRONTEND_LOCAL_IP_URL);

  const port = configService.get<number>('PORT') || 5000;
  const host = configService.get<string>('HOST') || '0.0.0.0';

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log('❌ Blocked by CORS:', origin);
      return callback(new Error('Not allowed by CORS'), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });

  app.setGlobalPrefix('api');

  await app.listen(port, host);

  const localIp = getLocalIp();

  console.log(`🚀 Server running on:`);
  console.log(`👉 Local:   http://localhost:${port}/api`);
  console.log(`👉 Network: http://${localIp}:${port}/api`);
}

bootstrap();
