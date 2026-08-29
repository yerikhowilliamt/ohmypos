import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
// Side-effect import: installs the jsdom polyfills Radix Select needs.
import '@/test/test-utils';

const currentUser = vi.fn();

vi.mock('@/hooks/useProfile', () => ({
  useCurrentUser: () => currentUser(),
}));
const branches = vi.fn();
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => branches(),
}));
vi.mock('@/hooks/useUsers', () => ({
  useCreateUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CreateUserDialog } from './CreateUserDialog';

const OWNER = { email: 'venty@lospollos.id' };

function open() {
  render(<CreateUserDialog open onOpenChange={vi.fn()} />);
  return {
    name: screen.getByLabelText('Nama'),
    email: screen.getByLabelText('Email'),
  };
}

const BRANCH_BASE = {
  address: null,
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.mockReturnValue({ data: OWNER });
  branches.mockReturnValue({ data: [] });
});

describe('CreateUserDialog — email suggested from the Owner’s domain', () => {
  it('fills the email from the name as the Owner types', () => {
    const { name, email } = open();

    fireEvent.change(name, { target: { value: 'novi' } });

    // The literal request: venty@lospollos.id creating "novi".
    expect(email).toHaveValue('novi@lospollos.id');
  });

  it('uses the first name only for a multi-word name', () => {
    const { name, email } = open();
    fireEvent.change(name, { target: { value: 'Novi Andriani' } });
    expect(email).toHaveValue('novi@lospollos.id');
  });

  it('stops overwriting once the Owner edits the email themselves', () => {
    const { name, email } = open();

    fireEvent.change(name, { target: { value: 'Novi' } });
    expect(email).toHaveValue('novi@lospollos.id');

    // The Owner deliberately picks a different address…
    fireEvent.change(email, { target: { value: 'novi.a@vendor.co.id' } });
    // …and then corrects the spelling of the name. Their choice must survive.
    fireEvent.change(name, { target: { value: 'Novi Andriani' } });

    expect(email).toHaveValue('novi.a@vendor.co.id');
  });

  it('shows the domain hint only while the address is still automatic', () => {
    const { name, email } = open();
    fireEvent.change(name, { target: { value: 'Novi' } });
    expect(
      screen.getByText(/Terisi otomatis dari domain/i),
    ).toBeInTheDocument();

    fireEvent.change(email, { target: { value: 'novi@vendor.co.id' } });
    expect(
      screen.queryByText(/Terisi otomatis dari domain/i),
    ).not.toBeInTheDocument();
  });

  it('leaves the field alone when the Owner has not loaded yet', () => {
    currentUser.mockReturnValue({ data: undefined });
    const { name, email } = open();

    fireEvent.change(name, { target: { value: 'Novi' } });

    expect(email).toHaveValue('');
    expect(email).toHaveAttribute('placeholder', 'nama@contoh.com');
  });

  it('leaves the field alone for a name with no ASCII letters', () => {
    const { name, email } = open();
    fireEvent.change(name, { target: { value: '李明' } });
    expect(email).toHaveValue('');
  });
});

describe('CreateUserDialog — cashier branch picker', () => {
  it('hides the system location, which has no POS screen to log in to', async () => {
    branches.mockReturnValue({
      data: [
        {
          ...BRANCH_BASE,
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Umum',
          isSystem: true,
          isMainStore: false,
        },
        {
          ...BRANCH_BASE,
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Toko Melati',
          isSystem: false,
          isMainStore: true,
        },
      ],
    });

    render(<CreateUserDialog open onOpenChange={vi.fn()} />);
    // The role defaults to KASIR, so the branch picker is already on screen.
    fireEvent.click(screen.getByLabelText('Cabang'));

    expect(
      await screen.findByRole('option', { name: 'Toko Melati' }),
    ).toBeInTheDocument();
    // A KASIR assigned here would log in to a POS that excludes their own
    // branch and land on an empty screen with no explanation.
    expect(
      screen.queryByRole('option', { name: 'Umum' }),
    ).not.toBeInTheDocument();
  });
});
