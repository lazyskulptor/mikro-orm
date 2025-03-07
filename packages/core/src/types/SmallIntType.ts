import { Type } from './Type';
import type { Platform } from '../platforms';
import type { EntityProperty } from '../typings';

export class SmallIntType extends Type<number | null | undefined, number | null | undefined> {

  getColumnType(prop: EntityProperty, platform: Platform) {
    return platform.getSmallIntTypeDeclarationSQL(prop);
  }

  compareAsType(): string {
    return 'number';
  }

  ensureComparable(): boolean {
    return false;
  }

}
