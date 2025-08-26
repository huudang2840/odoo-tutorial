from odoo import models, fields

class EstateProperty(models.Model):
    _name = "estate.property"
    _description = "Real Estate Property"
    _order = "id desc"

    name = fields.Char(required=True)
    expected_price = fields.Float(required=True)
    active = fields.Boolean(default=True)
    