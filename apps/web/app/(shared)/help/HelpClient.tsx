'use client';

import * as React from 'react';
import type { UserRole } from '@ohmypos/api-contracts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ohmypos/ui/components/accordion';
import { Input } from '@ohmypos/ui/components/input';
import { Search } from 'lucide-react';
import {
  HELP_CATEGORY_LABELS,
  filterHelpSections,
  getHelpSections,
  groupHelpSections,
} from '@/lib/help-content';
import { HelpBlockView } from '@/components/help/HelpBlocks';

export function HelpClient({ role }: { role: UserRole }) {
  const [query, setQuery] = React.useState('');

  const allSections = React.useMemo(() => getHelpSections(role), [role]);
  const groups = React.useMemo(
    () => groupHelpSections(filterHelpSections(allSections, query)),
    [allSections, query],
  );

  const matchCount = groups.reduce((sum, g) => sum + g.sections.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Bantuan
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Panduan memakai OhMyPos, khusus untuk peran Anda. Mulailah dari
          &quot;Konsep Dasar&quot; kalau Anda baru pertama kali memakai aplikasi
          ini.
        </p>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari topik, misalnya: utang, stok awal, umum"
          aria-label="Cari topik bantuan"
          className="pl-9"
        />
      </div>

      {matchCount === 0 ? (
        <div className="rounded-md border border-border-default bg-surface-raised p-6 text-center">
          <p className="text-sm font-medium text-text-primary">
            Tidak ada topik yang cocok
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Coba kata lain, atau kosongkan pencarian untuk melihat semua topik.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.category}>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {HELP_CATEGORY_LABELS[group.category]}
              </h2>
              {/* `multiple`, not `single`: this is a reference document, and
                  comparing two topics should not close the first one. */}
              <Accordion type="multiple" className="w-full">
                {group.sections.map((section) => (
                  <AccordionItem key={section.id} value={section.id}>
                    <AccordionTrigger>
                      <span className="flex flex-col gap-0.5 text-left">
                        <span>{section.title}</span>
                        <span className="text-xs font-normal text-text-tertiary">
                          {section.summary}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pb-2">
                        {section.blocks.map((block, index) => (
                          <HelpBlockView key={index} block={block} />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
