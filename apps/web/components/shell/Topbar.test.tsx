import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { SidebarProvider } from '@ohmypos/ui/components/sidebar';
import { renderWithClient } from '@/test/test-utils';
import { Topbar } from './Topbar';

/** `Topbar` reads `useSidebar()` for the mobile hamburger, so it always
 * needs a `SidebarProvider` ancestor — matching real usage inside
 * `AppShell`, which always renders it there. */
function renderTopbar(ui: React.ReactElement) {
  return renderWithClient(
    <SidebarProvider isMobile open>
      {ui}
    </SidebarProvider>,
  );
}

describe('Topbar — dark mode toggle', () => {
  it('renders the toggle when enableDarkMode is true on the default variant', () => {
    renderTopbar(
      <Topbar
        variant="default"
        enableDarkMode
        theme="light"
        onToggleTheme={() => {}}
      />,
    );
    expect(screen.getByTestId('topbar-theme-toggle')).toBeInTheDocument();
  });

  it('omits the toggle when enableDarkMode is not passed (shared routes)', () => {
    renderTopbar(<Topbar variant="default" />);
    expect(screen.queryByTestId('topbar-theme-toggle')).toBeNull();
  });

  it('omits the toggle on the pos variant even if enableDarkMode were true', () => {
    renderTopbar(<Topbar variant="pos" enableDarkMode theme="light" />);
    expect(screen.queryByTestId('topbar-theme-toggle')).toBeNull();
  });

  it('reflects the current theme via aria-pressed and swaps the icon label', () => {
    const { rerender } = renderTopbar(
      <Topbar
        variant="default"
        enableDarkMode
        theme="light"
        onToggleTheme={() => {}}
      />,
    );
    const toggle = screen.getByTestId('topbar-theme-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('aria-label', 'Ganti ke mode gelap');

    rerender(
      <SidebarProvider isMobile open>
        <Topbar
          variant="default"
          enableDarkMode
          theme="dark"
          onToggleTheme={() => {}}
        />
      </SidebarProvider>,
    );
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAttribute('aria-label', 'Ganti ke mode terang');
  });
});
