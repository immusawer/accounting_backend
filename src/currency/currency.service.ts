import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CurrencyService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.currency_setting.findMany({
      where: { isActive: true },
      orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
    });
  }

  async getBaseCurrency() {
    const base = await this.prisma.currency_setting.findFirst({
      where: { isBase: true },
    });
    return base || { code: 'USD', name: 'US Dollar', exchangeRate: 1 };
  }

  async getExchangeRate(currencyCode: string): Promise<number> {
    if (!currencyCode) return 1;
    const currency = await this.prisma.currency_setting.findUnique({
      where: { code: currencyCode.toUpperCase() },
    });
    return currency?.exchangeRate ?? 1;
  }

  async upsert(data: {
    code: string;
    name: string;
    symbol?: string;
    exchangeRate: number;
  }) {
    const code = data.code.toUpperCase().trim();
    const currency = await this.prisma.currency_setting.upsert({
      where: { code },
      update: {
        name: data.name.trim(),
        symbol: data.symbol?.trim() || null,
        exchangeRate: data.exchangeRate,
        isActive: true,
      },
      create: {
        code,
        name: data.name.trim(),
        symbol: data.symbol?.trim() || null,
        exchangeRate: data.exchangeRate,
      },
    });
    return { message: 'Currency saved', currency };
  }

  async setBaseCurrency(code: string) {
    const newBase = await this.prisma.currency_setting.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!newBase) throw new NotFoundException('Currency not found');
    if (newBase.isBase)
      return { message: `${code.toUpperCase()} is already the base currency` };

    // The new base's old rate tells us the conversion factor
    // If USD was base (rate=1) and AFN had rate=68.5
    // When AFN becomes base: USD rate = 1/68.5 = 0.0146, AED rate = 3.6725/68.5 = 0.0536
    const conversionFactor = newBase.exchangeRate;

    // Get all currencies to recalculate
    const allCurrencies = await this.prisma.currency_setting.findMany({
      where: { isActive: true },
    });

    const updates = allCurrencies.map((c) => {
      if (c.code === code.toUpperCase()) {
        // New base gets rate = 1
        return this.prisma.currency_setting.update({
          where: { code: c.code },
          data: { isBase: true, exchangeRate: 1 },
        });
      } else {
        // Recalculate: newRate = oldRate / conversionFactor
        const newRate =
          Math.round((c.exchangeRate / conversionFactor) * 10000) / 10000;
        return this.prisma.currency_setting.update({
          where: { code: c.code },
          data: { isBase: false, exchangeRate: newRate },
        });
      }
    });

    await this.prisma.$transaction([
      ...updates,
      this.prisma.app_setting.upsert({
        where: { key: 'baseCurrency' },
        update: { value: code.toUpperCase() },
        create: { key: 'baseCurrency', value: code.toUpperCase() },
      }),
    ]);

    return {
      message: `Base currency changed to ${code.toUpperCase()}. All rates recalculated.`,
    };
  }

  async updateRate(code: string, exchangeRate: number) {
    const currency = await this.prisma.currency_setting.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!currency) throw new NotFoundException('Currency not found');
    if (currency.isBase)
      throw new BadRequestException('Cannot change rate of base currency');

    const updated = await this.prisma.currency_setting.update({
      where: { code: code.toUpperCase() },
      data: { exchangeRate },
    });
    return { message: 'Exchange rate updated', currency: updated };
  }

  async remove(code: string) {
    const currency = await this.prisma.currency_setting.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!currency) throw new NotFoundException('Currency not found');
    if (currency.isBase)
      throw new BadRequestException('Cannot delete base currency');

    await this.prisma.currency_setting.update({
      where: { code: code.toUpperCase() },
      data: { isActive: false },
    });
    return { message: 'Currency deactivated' };
  }

  async seed() {
    const defaults = [
      {
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        exchangeRate: 1,
        isBase: true,
      },
      { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', exchangeRate: 3.6725 },
      { code: 'OMR', name: 'Omani Rial', symbol: 'ر.ع.', exchangeRate: 0.3845 },
      { code: 'GEL', name: 'Georgian Lari', symbol: '₾', exchangeRate: 2.65 },
      {
        code: 'CAD',
        name: 'Canadian Dollar',
        symbol: 'C$',
        exchangeRate: 1.36,
      },
      { code: 'AFN', name: 'Afghan Afghani', symbol: '؋', exchangeRate: 68.5 },
    ];
    for (const d of defaults) {
      await this.prisma.currency_setting.upsert({
        where: { code: d.code },
        update: {},
        create: d,
      });
    }
    await this.prisma.app_setting.upsert({
      where: { key: 'baseCurrency' },
      update: {},
      create: { key: 'baseCurrency', value: 'USD' },
    });
    return { message: 'Currencies seeded' };
  }
}

export function convertToBase(amount: number, exchangeRate: number): number {
  if (!exchangeRate || exchangeRate === 0) return amount;
  return Math.round((amount / exchangeRate) * 100) / 100;
}
