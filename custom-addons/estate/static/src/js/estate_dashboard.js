/** @odoo-module **/
import {registry} from "@web/core/registry";
import {Component, onMounted, useState} from "@odoo/owl";
import {useService} from "@web/core/utils/hooks";
import {loadJS} from "@web/core/assets";

/* ------------ helpers ------------- */
// YYYY-MM theo local time
function yyyymmLocal ( d ) {
    const y = d.getFullYear();
    const m = String( d.getMonth() + 1 ).padStart( 2, "0" );
    return `${ y }-${ m }`;
}
function lastNMonthsLabels ( n = 12 ) {
    const base = new Date(); base.setDate( 1 ); // đầu tháng hiện tại
    const labels = [];
    for( let i = n - 1; i >= 0; i-- )
    {
        labels.push( yyyymmLocal( new Date( base.getFullYear(), base.getMonth() - i, 1 ) ) );
    }
    return labels;
}
function monthStartISO () {
    const d = new Date();
    return new Date( d.getFullYear(), d.getMonth(), 1 ).toISOString();
}
function vn ( n ) {
    return ( n ?? 0 ).toLocaleString( "vi-VN" );
}
async function ensureChartJS () {
    if( window.Chart ) return;
    try {await loadJS( "/web/static/lib/Chart/Chart.js" );} catch { }
    if( !window.Chart ) try {await loadJS( "/web/static/lib/Chart/Chart.min.js" );} catch { }
}

class EstateDashboard extends Component {
    setup () {
        this.orm = useService( "orm" );
        this.state = useState( {
            kpi: {
                total_properties: 0,
                for_sale: 0,
                sold_this_month: 0,
                avg_selling_price_all: 0,
                avg_selling_price_month: 0,
            },
            kpiFmt: {},
            salesLabels: [],
            salesValues: [],
            offersLabels: [],
            offersValues: [],
        } );

        onMounted( async () => {
            await ensureChartJS();
            await this.loadData();
            this.renderCharts();
        } );
    }

    async loadData () {
        const yyyymm = ( d ) => `${ d.getFullYear() }-${ String( d.getMonth() + 1 ).padStart( 2, "0" ) }`;
        const labels12 = ( () => {
            const base = new Date(); base.setDate( 1 );
            const a = [];
            for( let i = 11; i >= 0; i-- ) a.push( yyyymm( new Date( base.getFullYear(), base.getMonth() - i, 1 ) ) );
            return a;
        } )();
        const monthStartISO = new Date( new Date().getFullYear(), new Date().getMonth(), 1 ).toISOString();
        const sumArr = ( xs ) => xs.reduce( ( s, v ) => s + ( v || 0 ), 0 );
        const fmtVN = ( n ) => ( n ?? 0 ).toLocaleString( "vi-VN" );

        /* ===== KPI cơ bản & Giá bán TB ===== */
        const [ total, forSale, soldThisMonth ] = await Promise.all( [
            this.orm.searchCount( "estate.property", [] ),
            this.orm.searchCount( "estate.property", [ [ "state", "=", "new" ] ] ),
            this.orm.searchCount( "estate.property", [ [ "state", "=", "sold" ], [ "write_date", ">=", monthStartISO ] ] ),
        ] );

        // TB toàn thời gian
        let avgAll = 0;
        let rows = await this.orm.readGroup(
            "estate.property",
            [ [ "state", "=", "sold" ], [ "selling_price", ">", 0 ] ],
            [ "selling_price:avg" ], [], {lazy: false}
        );
        avgAll = Math.round( rows?.[ 0 ]?.[ "selling_price:avg" ] || 0 );
        if( !avgAll )
        {
            const recs = await this.orm.searchRead(
                "estate.property", [ [ "state", "=", "sold" ], [ "selling_price", ">", 0 ] ],
                [ "selling_price" ], {limit: 0}
            );
            avgAll = recs.length ? Math.round( sumArr( recs.map( r => r.selling_price ) ) / recs.length ) : 0;
        }

        // TB tháng này
        let avgMonth = 0;
        rows = await this.orm.readGroup(
            "estate.property",
            [ [ "state", "=", "sold" ], [ "selling_price", ">", 0 ], [ "write_date", ">=", monthStartISO ] ],
            [ "selling_price:avg" ], [], {lazy: false}
        );
        avgMonth = Math.round( rows?.[ 0 ]?.[ "selling_price:avg" ] || 0 );
        if( !avgMonth )
        {
            const recs = await this.orm.searchRead(
                "estate.property",
                [ [ "state", "=", "sold" ], [ "selling_price", ">", 0 ], [ "write_date", ">=", monthStartISO ] ],
                [ "selling_price" ], {limit: 0}
            );
            avgMonth = recs.length ? Math.round( sumArr( recs.map( r => r.selling_price ) ) / recs.length ) : 0;
        }

        /* ===== Doanh thu theo tháng (ưu tiên HÓA ĐƠN) ===== */
        // 1) lấy các property đã bán có hóa đơn
        const propsWithInv = await this.orm.searchRead(
            "estate.property",
            [ [ "state", "=", "sold" ], [ "invoice_id", "!=", false ] ],
            [ "invoice_id" ], {limit: 0}
        );
        const invIds = [ ...new Set( propsWithInv.map( p => p.invoice_id && p.invoice_id[ 0 ] ).filter( Boolean ) ) ];

        // 2) đọc hóa đơn posted (out_invoice/out_refund)
        let buckets = Object.fromEntries( labels12.map( m => [ m, 0 ] ) );
        if( invIds.length )
        {
            const invoices = await this.orm.read(
                "account.move", invIds,
                [ "state", "move_type", "invoice_date", "date", "amount_total_signed", "amount_total" ]
            );
            for( const inv of invoices )
            {
                if( inv.state !== "posted" ) continue;
                if( ![ "out_invoice", "out_refund" ].includes( inv.move_type ) ) continue;
                const d = inv.invoice_date || inv.date; if( !d ) continue;
                const dd = new Date( d ); const key = yyyymm( dd );
                const amt = inv.amount_total_signed ?? inv.amount_total ?? 0;
                if( key in buckets ) buckets[ key ] += amt;
            }
        }

        // 3) fallback nếu chưa có hóa đơn → dùng selling_price của property sold
        if( Object.values( buckets ).every( v => !v ) )
        {
            const soldProps = await this.orm.searchRead(
                "estate.property",
                [ [ "state", "=", "sold" ], [ "selling_price", ">", 0 ] ],
                [ "selling_price", "write_date", "create_date" ], {limit: 0}
            );
            for( const r of soldProps )
            {
                const dt = r.write_date ? new Date( r.write_date ) : ( r.create_date ? new Date( r.create_date ) : null );
                if( !dt ) continue;
                const key = yyyymm( dt );
                if( key in buckets ) buckets[ key ] += ( r.selling_price || 0 );
            }
        }
        const salesLabels = labels12;
        const salesValues = salesLabels.map( m => buckets[ m ] || 0 );

        /* ===== Số offer theo loại BĐS (đếm chắc chắn) ===== */
        // group theo property trước…
        const perProp = await this.orm.readGroup(
            "estate.property.offer", [], [ "__count" ], [ "property_id" ],
            {lazy: false, orderby: "__count desc"}
        );
        const propIds = perProp.map( r => r.property_id && r.property_id[ 0 ] ).filter( Boolean );
        let typeByProp = {};
        if( propIds.length )
        {
            const props = await this.orm.read( "estate.property", propIds, [ "property_type_id" ] );
            typeByProp = Object.fromEntries( props.map(
                p => [ p.id, ( p.property_type_id && p.property_type_id[ 1 ] ) || "Unknown" ]
            ) );
        }
        const typeBucket = {};
        for( const r of perProp )
        {
            const pid = r.property_id && r.property_id[ 0 ];
            const tName = typeByProp[ pid ] || "Unknown";
            typeBucket[ tName ] = ( typeBucket[ tName ] || 0 ) + ( r[ "__count" ] || 0 );
        }
        const offerLabels = Object.keys( typeBucket );
        const offerValues = offerLabels.map( k => typeBucket[ k ] );

        /* ===== set state ===== */
        this.state.kpi = {
            total_properties: total,
            for_sale: forSale,
            sold_this_month: soldThisMonth,
            avg_selling_price_all: avgAll,
            avg_selling_price_month: avgMonth,
        };
        this.state.kpiFmt = {
            total_properties: fmtVN( total ),
            for_sale: fmtVN( forSale ),
            sold_this_month: fmtVN( soldThisMonth ),
            avg_selling_price_all: fmtVN( avgAll ),
            avg_selling_price_month: fmtVN( avgMonth ),
        };
        this.state.salesLabels = salesLabels;
        this.state.salesValues = salesValues;
        this.state.offersLabels = offerLabels;
        this.state.offersValues = offerValues;
    }

    renderCharts () {
        if( !window.Chart ) return;

        const salesCtx = document.getElementById( "est_chart_sales" );
        if( salesCtx )
        {
            new window.Chart( salesCtx, {
                type: "line",
                data: {
                    labels: this.state.salesLabels,
                    datasets: [ {label: "Doanh thu (đ)", data: this.state.salesValues} ],
                },
                options: {
                    maintainAspectRatio: false,
                    plugins: {legend: {display: true}},
                    responsive: true,
                    scales: {y: {beginAtZero: true}},
                },
            } );
        }

        const offerCtx = document.getElementById( "est_chart_offers" );
        if( offerCtx )
        {
            new window.Chart( offerCtx, {
                type: "bar",
                data: {
                    labels: this.state.offersLabels,
                    datasets: [ {label: "Số offer", data: this.state.offersValues} ],
                },
                options: {
                    maintainAspectRatio: false,
                    plugins: {legend: {display: true}},
                    responsive: true,
                    scales: {y: {beginAtZero: true, ticks: {precision: 0}}},
                },
            } );
        }
    }
}

EstateDashboard.template = "estate.Dashboard";
registry.category( "actions" ).add( "estate.dashboard", EstateDashboard );
