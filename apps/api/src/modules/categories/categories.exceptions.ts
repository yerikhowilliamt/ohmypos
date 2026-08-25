import { ConflictException } from '@nestjs/common';

export class CategoryNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Category with name "${name}" already exists`);
    this.name = 'CategoryNameTakenException';
  }
}

export class SystemCategoryProtectedException extends ConflictException {
  constructor(name: string) {
    super(`System category "${name}" cannot be changed or deleted`);
    this.name = 'SystemCategoryProtectedException';
  }
}

export class CategoryInUseException extends ConflictException {
  constructor(id: string) {
    super(
      `Category with ID ${id} cannot be deleted because it is referenced by existing ledger entries`,
    );
    this.name = 'CategoryInUseException';
  }
}
