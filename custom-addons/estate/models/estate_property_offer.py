from odoo import api, fields, models
from odoo.exceptions import ValidationError
from datetime import date, timedelta


class EstatePropertyOffer(models.Model):
    _name = "estate.property.offer"
    _description = "Property Offer"
    _order = "price desc"

    price = fields.Float(required=True)
    status = fields.Selection(
        [("accepted", "Accepted"), ("refused", "Refused"), ("expired", "Expired"),],
        default=False,  # pending
        copy=False,
    )
    partner_id = fields.Many2one("res.partner", required=True, string="Buyer")
    property_id = fields.Many2one("estate.property", required=True, ondelete="cascade")

    validity = fields.Integer(default=7)
    deadline = fields.Date(compute="_compute_deadline", inverse="_inverse_deadline", store=True)

    @api.depends("validity")
    def _compute_deadline(self):
        today = date.today()
        for rec in self:
            rec.deadline = today + timedelta(days=rec.validity or 0)

    def _inverse_deadline(self):
        today = date.today()
        for rec in self:
            if rec.deadline:
                rec.validity = (rec.deadline - today).days

    def action_accept(self):
        for offer in self:
            prop = offer.property_id
            if prop.state == "sold":
                raise ValidationError("Property already sold.")

            # 1) set trạng thái & giá bán Property
            offer.status = "accepted"
            prop.selling_price = offer.price
            prop.state = "sold"

            # 2) từ chối các offer khác
            (prop.offer_ids - offer).write({"status": "refused"})

            # 3) tạo Invoice khi SOLD (yêu cầu 'account' đã cài)
            #    tạo 1 hóa đơn out_invoice cho buyer với 1 dòng giá = price
            move = self.env["account.move"].create({
                "move_type": "out_invoice",
                "partner_id": offer.partner_id.id,
                "invoice_line_ids": [
                    (0, 0, {
                        "name": f"Sale of {prop.name}",
                        "quantity": 1.0,
                        "price_unit": offer.price,
                    })
                ],
            })
            prop.invoice_id = move.id
            # post hóa đơn (xác nhận)
            move.action_post()

        return True

    def action_refuse(self):
        self.write({"status": "refused"})
        return True
    
    def action_check_expired(self):
        today = date.today()
        offers = self.search([
            ("status", "=", False),         # chỉ offer chưa xử lý
            ("deadline", "<", today),       # đã quá hạn
        ])
        offers.write({"status": "expired"})
        return True
