import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { circuitTab, newProject, parts } from './helpers.ts'

async function openVerilog(page: Page): Promise<void> {
  await page.keyboard.press('Control+k')
  await page.keyboard.type('Build circuits from Verilog')
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Verilog, one circuit for each module')).toBeVisible()
}

test('Verilog modules become circuits of the project', async ({ page }) => {
  await newProject(page)
  await openVerilog(page)
  await page.getByLabel('Verilog, one circuit for each module').fill(`
    module half_adder (input a, input b, output sum, output carry);
      assign sum = a ^ b;
      assign carry = a & b;
    endmodule
    module top (input x, input y, output s, output c);
      half_adder first (.a(x), .b(y), .sum(s), .carry(c));
    endmodule`)
  await page.getByRole('button', { name: 'Build circuits' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(circuitTab(page, 'half_adder')).toBeVisible()
  await expect(circuitTab(page, 'top')).toBeVisible()
  // The last module, which no other uses, is opened: two switches, the half adder and two outputs.
  expect((await parts(page)).map((part) => part.type).sort()).toEqual(['circuit', 'input', 'input', 'output', 'output'])
})

test('what cannot be read is refused with its line and column', async ({ page }) => {
  await newProject(page)
  await openVerilog(page)
  await page.getByLabel('Verilog, one circuit for each module').fill('module m (input a, output y);\n  assign y = a\nendmodule')
  await page.getByRole('button', { name: 'Build circuits' }).click()
  await expect(page.locator('#verilog-problem')).toContainText('Line 2, column 15')
  await expect(page.getByRole('dialog')).toBeVisible()
})
