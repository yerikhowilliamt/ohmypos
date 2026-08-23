import path from 'path';

export const OWNER_CREDS = {
  email: 'owner@ohmypos.local',
  password: 'ChangeMe123!',
};
export const ADMIN_CREDS = {
  email: 'admin@ohmypos.local',
  password: 'ChangeMe123!',
};
export const KASIR_CREDS = {
  email: 'kasir@ohmypos.local',
  password: 'ChangeMe123!',
};

export const OWNER_STATE = path.join(__dirname, '.auth/owner.json');
export const ADMIN_STATE = path.join(__dirname, '.auth/admin.json');
export const KASIR_STATE = path.join(__dirname, '.auth/kasir.json');
