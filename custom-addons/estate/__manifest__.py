{
    "name": "Estate",
    "version": "17.0.1.0.0",
    "summary": "Tutorial module: Estate (Property/Offer/Type)",
    "category": "Tutorial",
    "license": "LGPL-3",
    "author": "Your Name",
    "depends": ["base", "account"],  # res.partner nằm trong base
    "data": [
        "security/estate_security.xml",
        "security/ir.model.access.csv",

        "views/estate_property_views.xml",
        "views/estate_property_offer_views.xml",
        "views/estate_property_type_views.xml",
        "views/estate_report_views.xml",
        "views/estate_dashboard_views.xml",

        "data/estate_cron.xml", 
    ],
    "assets": {
        "web.assets_backend": [
            "estate/static/src/xml/estate_dashboard.xml",
            "estate/static/src/js/estate_dashboard.js",
        ],
    },
    "application": True,
    
}
