'use client';

import type { UserRole } from '@ohmypos/api-contracts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ohmypos/ui/components/accordion';
import { getHelpSections } from '@/lib/help-content';

export function HelpClient({ role }: { role: UserRole }) {
  const sections = getHelpSections(role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Bantuan
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Panduan langkah demi langkah menggunakan OhMyPos, khusus untuk peran
          Anda.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {sections.map((section) => (
          <AccordionItem key={section.id} value={section.id}>
            <AccordionTrigger>{section.title}</AccordionTrigger>
            <AccordionContent>
              <ol className="list-decimal space-y-1.5 pl-5">
                {section.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
