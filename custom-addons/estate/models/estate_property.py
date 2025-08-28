from odoo import api, fields, models
from odoo.exceptions import ValidationError


class EstateProperty(models.Model):
    _name = "estate.property"
    _description = "Real Estate Property"
    _order = "id desc"

    # Core fields
    name = fields.Char(required=True)
    expected_price = fields.Float(required=True)  # <-- sửa chính tả
    selling_price = fields.Float(readonly=True, copy=False)

    # Trạng thái theo workflow
    state = fields.Selection(
        [("new", "New"), ("sold", "Sold"), ("canceled", "Canceled")],
        default="new",
        copy=False,
        required=True,
    )

    # Phân loại & thuộc tính cơ bản
    property_type_id = fields.Many2one("estate.property.type", string="Property Type")
    bedrooms = fields.Integer(default=2)
    garden = fields.Boolean()

    # Offers N:1
    offer_ids = fields.One2many("estate.property.offer", "property_id", string="Offers")

    # Hóa đơn được tạo khi SOLD (chỉ dùng được nếu đã cài module 'account')
    invoice_id = fields.Many2one("account.move", string="Invoice", readonly=True, copy=False)

    # --- RÀNG BUỘC GIÁ ---
    @api.constrains("expected_price", "selling_price")
    def _constrains_prices(self):
        for rec in self:
            if rec.selling_price and rec.selling_price < 0.9 * rec.expected_price:
                raise ValidationError("Selling price must be at least 90% of the expected price.")

    # --- ACTIONS ---
    def action_sold(self):
        for rec in self:
            if rec.state == "canceled":
                raise ValidationError("Canceled properties cannot be sold.")
            rec.state = "sold"
        return True

    def action_cancel(self):
        for rec in self:
            if rec.state == "sold":
                raise ValidationError("Sold properties cannot be canceled.")
            rec.state = "canceled"
        return True
