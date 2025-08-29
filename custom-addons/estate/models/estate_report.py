from odoo import fields, models, tools

class EstateReport(models.Model):
    _name = "estate.report"
    _description = "Estate Reporting"
    _auto = False
    _order = "create_date desc"

    # Dimensions
    property_id = fields.Many2one("estate.property", readonly=True)
    name = fields.Char(readonly=True)
    create_date = fields.Datetime(readonly=True)
    state = fields.Selection(
        [("new", "New"), ("sold", "Sold"), ("canceled", "Canceled")],
        readonly=True,
    )
    property_type_id = fields.Many2one("estate.property.type", readonly=True)

    # Measures
    expected_price = fields.Float(readonly=True)
    selling_price = fields.Float(readonly=True)
    best_offer = fields.Float(readonly=True)
    offer_count = fields.Integer(readonly=True)
    days_to_sell = fields.Float(string="Days to Sell", digits=(16, 2), readonly=True)

    def init(self):
        tools.drop_view_if_exists(self._cr, "estate_report")
        self._cr.execute("""
            CREATE OR REPLACE VIEW estate_report AS
            SELECT
                p.id                             AS id,
                p.id                             AS property_id,
                p.name                           AS name,
                p.create_date                    AS create_date,
                p.state                          AS state,
                p.property_type_id               AS property_type_id,
                p.expected_price                 AS expected_price,
                p.selling_price                  AS selling_price,
                COALESCE(MAX(o.price), 0)        AS best_offer,
                COUNT(o.id)                      AS offer_count,
                CASE
                    WHEN p.state = 'sold' AND p.selling_price IS NOT NULL
                        THEN EXTRACT(EPOCH FROM (p.write_date - p.create_date))/86400.0
                    ELSE NULL
                END                              AS days_to_sell
            FROM estate_property p
            LEFT JOIN estate_property_offer o ON o.property_id = p.id
            GROUP BY
                p.id, p.name, p.create_date, p.state, p.property_type_id,
                p.expected_price, p.selling_price, p.write_date;
        """)
