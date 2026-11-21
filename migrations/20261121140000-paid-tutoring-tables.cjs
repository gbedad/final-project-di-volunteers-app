'use strict';

// Applied by scripts/migrate-paid-tutoring.js
// Paid tutoring money: who pays (payeurs), the invoices sent to them, the
// payments received, and the fees paid to the tutors (auto-entrepreneurs).
// Amounts are integer cents. No VAT: the association does not recover it.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('payeurs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'famille' or 'eleve_majeur' (a minor's payer is the family)
      type: { type: Sequelize.STRING, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING },
      address: { type: Sequelize.TEXT },
      // Identifier of the third party in the accounting software (empty until created there)
      accounting_tiers_id: { type: Sequelize.STRING },
      student_id: { type: Sequelize.INTEGER, references: { model: 'students', key: 'id' }, onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    await queryInterface.createTable('factures', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // Continuous, never reused: F2026-0001 (see services/invoicing.js)
      numero: { type: Sequelize.STRING, allowNull: false, unique: true },
      payeur_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'payeurs', key: 'id' } },
      binome_id: { type: Sequelize.INTEGER, references: { model: 'binomes', key: 'id' }, onDelete: 'SET NULL' },
      issued_on: { type: Sequelize.DATEONLY, allowNull: false },
      label: { type: Sequelize.STRING, allowNull: false },
      amount_cents: { type: Sequelize.INTEGER, allowNull: false },
      // 'emise' or 'annulee'. An issued invoice is never edited: it is cancelled by a credit note
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'emise' },
      // The credit note (avoir) cancelling this invoice, if any
      cancels_facture_id: { type: Sequelize.INTEGER, references: { model: 'factures', key: 'id' }, onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    await queryInterface.createTable('paiements', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      facture_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'factures', key: 'id' }, onDelete: 'CASCADE' },
      paid_on: { type: Sequelize.DATEONLY, allowNull: false },
      amount_cents: { type: Sequelize.INTEGER, allowNull: false },
      // 'virement', 'carte', 'cheque', 'especes', 'helloasso'…
      method: { type: Sequelize.STRING },
      reference: { type: Sequelize.STRING },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    await queryInterface.createTable('remunerations_tuteurs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      tuteur_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
      // Period covered by the fee (YYYY-MM)
      period: { type: Sequelize.STRING, allowNull: false },
      amount_cents: { type: Sequelize.INTEGER, allowNull: false },
      // Invoice number of the auto-entrepreneur tutor (their own numbering)
      tutor_invoice_ref: { type: Sequelize.STRING },
      // 'a_payer' or 'payee'
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'a_payer' },
      paid_on: { type: Sequelize.DATEONLY },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('remunerations_tuteurs');
    await queryInterface.dropTable('paiements');
    await queryInterface.dropTable('factures');
    await queryInterface.dropTable('payeurs');
  },
};
