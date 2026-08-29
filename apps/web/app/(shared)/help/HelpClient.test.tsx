import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { HelpClient } from './HelpClient';

function search(value: string) {
  fireEvent.change(screen.getByLabelText('Cari topik bantuan'), {
    target: { value },
  });
}

describe('HelpClient', () => {
  it('leads with Konsep Dasar rather than a click-path', () => {
    render(<HelpClient role="OWNER" />);

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(headings[0]).toBe('Konsep Dasar');
  });

  it('shows each topic’s summary before it is expanded', () => {
    render(<HelpClient role="OWNER" />);

    // The trigger carries the one-line summary, so a reader can pick a topic
    // without opening several.
    expect(
      screen.getByText(
        /Dua istilah yang terdengar sama, artinya justru bertingkat/i,
      ),
    ).toBeInTheDocument();
  });

  it('reveals a topic’s body only once it is opened', () => {
    render(<HelpClient role="OWNER" />);

    const trigger = screen.getByRole('button', {
      name: /Beda "Umum" dan "Semua Cabang"/i,
    });
    expect(
      screen.queryByText(/Bukan lokasi, melainkan pilihan/i),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(
      screen.getByText(/Bukan lokasi, melainkan pilihan/i),
    ).toBeInTheDocument();
  });

  it('keeps two topics open at once', () => {
    // `type="multiple"`: comparing two topics must not close the first.
    render(<HelpClient role="OWNER" />);

    fireEvent.click(
      screen.getByRole('button', { name: /Beda "Umum" dan "Semua Cabang"/i }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: /Kapan sebuah pembelian menjadi utang/i,
      }),
    );

    expect(
      screen.getByText(/Bukan lokasi, melainkan pilihan/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Barangnya sudah di tangan/i)).toBeInTheDocument();
  });

  it('filters topics by a word buried in the body', () => {
    render(<HelpClient role="OWNER" />);

    search('jatuh tempo');

    expect(
      screen.getByRole('button', { name: /Pelunasan Utang/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Melayani penjualan/i }),
    ).not.toBeInTheDocument();
  });

  it('explains itself when a search matches nothing', () => {
    render(<HelpClient role="OWNER" />);

    search('zzzznotatopic');

    expect(screen.getByText('Tidak ada topik yang cocok')).toBeInTheDocument();
  });

  it('hides Owner-only topics from a Kasir', () => {
    render(<HelpClient role="KASIR" />);

    expect(
      screen.getByRole('button', { name: /Melayani penjualan/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Pelunasan Utang/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Laporan' }),
    ).not.toBeInTheDocument();
  });

  it('renders a flow diagram as text nodes, not an image', () => {
    // The chain must stay greppable and theme-aware — see the FlowDiagram
    // comment for why this is never a screenshot.
    render(<HelpClient role="OWNER" />);

    fireEvent.click(screen.getByRole('button', { name: /Alur besar/i }));

    // Anchored on the caption, which is unique — "Bahan Baku" is also a
    // topic title elsewhere on the page.
    const figure = screen
      .getByText(/Setiap panah berjalan otomatis/i)
      .closest('figure');
    expect(figure).not.toBeNull();
    expect(within(figure!).getByText('Bahan Baku')).toBeInTheDocument();
    expect(within(figure!).getByText('Resep')).toBeInTheDocument();
    expect(within(figure!).queryByRole('img')).not.toBeInTheDocument();
  });
});
