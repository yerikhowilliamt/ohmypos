import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { CartLine } from '@/lib/pos/cart.reducer';
import { OrderSummary } from './OrderSummary';
import { QuantityStepper } from './QuantityStepper';
import { CartLineRow } from './CartLineRow';

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: 'line-1',
    productId: 'p1',
    productName: 'Es Kopi Susu',
    masterPrice: '20000.00',
    overridePrice: null,
    quantity: 2,
    ...overrides,
  };
}

describe('QuantityStepper', () => {
  it('renders [−][qty][+] inside one pill container', () => {
    const { container } = render(
      <QuantityStepper
        quantity={3}
        itemLabel="Es Kopi Susu"
        idSuffix="line-1"
        onIncrement={() => {}}
        onDecrement={() => {}}
      />,
    );
    expect(screen.getByTestId('cart-quantity-line-1')).toHaveTextContent('3');
    // §25: a single grouped control, not three loose buttons.
    expect(container.firstElementChild?.className).toContain('rounded-pill');
    expect(container.firstElementChild?.className).toContain('border');
  });

  it('reports increment and decrement', () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    render(
      <QuantityStepper
        quantity={3}
        itemLabel="Es Kopi Susu"
        idSuffix="line-1"
        onIncrement={onIncrement}
        onDecrement={onDecrement}
      />,
    );
    fireEvent.click(screen.getByTestId('cart-increment-line-1'));
    fireEvent.click(screen.getByTestId('cart-decrement-line-1'));
    expect(onIncrement).toHaveBeenCalledTimes(1);
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it('exposes accessible names for both buttons', () => {
    render(
      <QuantityStepper
        quantity={1}
        itemLabel="Es Kopi Susu"
        idSuffix="line-1"
        onIncrement={() => {}}
        onDecrement={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Tambah Es Kopi Susu' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Kurangi Es Kopi Susu' }),
    ).toBeInTheDocument();
  });
});

describe('OrderSummary', () => {
  it('shows the item count in the subtotal label and the total in mono', () => {
    render(<OrderSummary itemCount={3} total="45000.00" />);
    expect(screen.getByText('Subtotal (3)')).toBeInTheDocument();
    const total = screen.getByTestId('cart-total');
    expect(total).toHaveTextContent('45.000');
    expect(total.className).toContain('font-mono');
  });

  it('renders no tax row — v1 has no tax column (ADR-015)', () => {
    render(<OrderSummary itemCount={1} total="20000.00" />);
    expect(screen.queryByText(/pajak/i)).toBeNull();
    expect(screen.queryByText(/tax/i)).toBeNull();
  });
});

describe('CartLineRow', () => {
  const handlers = {
    onIncrement: () => {},
    onDecrement: () => {},
    onRemove: () => {},
    onPriceChange: () => {},
  };

  it('renders name, stepper, and right-aligned line total', () => {
    render(
      <ul>
        <CartLineRow
          line={line()}
          photoUrl={null}
          isOverCommitted={false}
          {...handlers}
        />
      </ul>,
    );
    expect(screen.getByText('Es Kopi Susu')).toBeInTheDocument();
    expect(screen.getByTestId('cart-quantity-line-1')).toHaveTextContent('2');
    expect(screen.getByText('Rp 40.000')).toBeInTheDocument();
  });

  it('gives the delete control a danger colour and a 40px target', () => {
    render(
      <ul>
        <CartLineRow
          line={line()}
          photoUrl={null}
          isOverCommitted={false}
          {...handlers}
        />
      </ul>,
    );
    const remove = screen.getByTestId('cart-remove-line-1');
    expect(remove.className).toContain('text-status-danger');
    expect(remove.className).toContain('size-10');
  });

  it('flags an over-committed line without adding a card border', () => {
    render(
      <ul>
        <CartLineRow
          line={line()}
          photoUrl={null}
          isOverCommitted
          {...handlers}
        />
      </ul>,
    );
    const row = screen.getByTestId('cart-line-line-1');
    expect(row).toHaveAttribute('data-over-committed', 'true');
    // §24.1: dividers, not a border per row.
    expect(row.className).toContain('border-b');
  });

  it('marks an overridden price', () => {
    render(
      <ul>
        <CartLineRow
          line={line({ overridePrice: '15000.00' })}
          photoUrl={null}
          isOverCommitted={false}
          {...handlers}
        />
      </ul>,
    );
    expect(screen.getByText('Harga khusus')).toBeInTheDocument();
  });
});
