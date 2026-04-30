// ==========================================
// app.js - Lógica Corregida por Tipo de Tienda (Solo Mayoreo/Detalle en Filtro)
// ==========================================

let globalData = [];
let chart1 = null, chart2 = null, tablaG = null, tablaT = null;
let actualizando = false;

// Listas para filtros. f_tipo_tienda ya no incluirá CEDIS.
let lookups = { 
    empresa: new Set(), cat_tienda: new Set(), tipo_tienda: new Set(), 
    tienda: new Set(), division: new Set(), categoria: new Set(), grupo: new Set() 
};

function formatNum(num) { 
    return Number(num).toLocaleString('en-US', { maximumFractionDigits: 0 }); 
}

function formatState(state) {
    if (!state.id) return state.text;
    var $cb = $('<input type="checkbox" class="select2-checkbox">');
    if (state.selected) $cb.prop('checked', true);
    return $('<span></span>').append($cb).append(' ' + state.text);
}

function determineEmpresa(name) {
    name = String(name).toUpperCase();
    if (name.includes('DS') || name.includes('DANILOS')) return 'DANILOS STORE';
    return 'EL COMPADRE';
}

function cleanNumber(val) {
    if (val === null || val === undefined) return 0;
    let cleanedString = String(val).replace(/,/g, '').replace(/\s/g, '').replace('$', '');
    let parsed = parseFloat(cleanedString);
    return isNaN(parsed) ? 0 : parsed;
}

$(document).ready(function () {
    Chart.register(ChartDataLabels);
    $('.form-select').select2({ theme: 'bootstrap-5', placeholder: 'Todas...', allowClear: true, closeOnSelect: false, templateResult: formatState });

    const conf = { language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, pageLength: 20, deferRender: true };
    tablaG = $('#tablaGrupo').DataTable(conf);
    tablaT = $('#tablaTienda').DataTable(conf);

    // ==========================================
    // EJECUCIÓN AUTOMÁTICA
    // ==========================================
    Papa.parse("reporte_ventas_unidades_2025_2026.csv", {
        download: true,
        header: true,
        delimiter: ";", 
        skipEmptyLines: true,
        dynamicTyping: false,
        chunk: function(results) {
            results.data.forEach(row => {
                if (!row.Name || !row.Grupo) return; 
                
                const empresa = determineEmpresa(row.Name);
                const upperName = String(row.Name).toUpperCase();
                
                // LÓGICA SEPARADA PARA TIPO DE TIENDA
                
                // 1. Vía KPI: ¿Es un CEDIS real? (Para sumar Saldo CEDIS)
                const isCedisKpiBucket = upperName.includes('CD ') || upperName.includes('CEDIS');
                
                // 2. Vía Filtro: ¿Qué mostramos en el dropdown? (SOLO DETALLE O MAYOREO)
                let tipoTiendaFilter = 'DETALLE'; // default
                if (upperName.includes('AEC') || upperName.includes('DS') || upperName.includes('MAYOREO') || upperName.includes('MEGABODEGA')) {
                    tipoTiendaFilter = 'MAYOREO';
                } else if (isCedisKpiBucket) {
                    // Si es CD Evelyn, etc., lo agrupamos bajo 'MAYOREO' para el filtro del usuario
                    tipoTiendaFilter = 'MAYOREO'; 
                }
                
                const catT = row.Categoria_Tienda || 'N/A';
                
                const s_ant = cleanNumber(row.Saldo_Actual); 
                const s_act = cleanNumber(row.Saldo_Anterior); 
                const v_ant = cleanNumber(row.Venta_Und_Anterior);
                const v_act = cleanNumber(row.Venta_Und_Actual);
                const dif = cleanNumber(row.Diferencia_Und);

                // Llenamos los filtros
                lookups.empresa.add(empresa); 
                lookups.cat_tienda.add(catT); 
                // AQUÍ ESTÁ EL CAMBIO: f_tipo_tienda solo recibirá DETALLE o MAYOREO
                lookups.tipo_tienda.add(tipoTiendaFilter); 
                lookups.tienda.add(row.Name); 
                lookups.division.add(row.Division); 
                lookups.categoria.add(row.Categoria); 
                lookups.grupo.add(row.Grupo);

                globalData.push({
                    emp: empresa, catT: catT, 
                    // Guardamos la clasificación del filtro en 'tipo'
                    tipo: tipoTiendaFilter, 
                    tda: row.Name, div: row.Division, cat: row.Categoria, grp: row.Grupo,
                    s_ant: s_ant, s_act: s_act, v_ant: v_ant, v_act: v_act, dif: dif, 
                    // Guardamos la clasificación interna del KPI en 'is_cedis'
                    is_cedis: isCedisKpiBucket 
                });
            });
        },
        complete: function() {
            populateSelects();
            $('#main-content').show();
            filtrarYActualizar();
            $('#loader-overlay').hide(); 
        },
        error: function(err) {
            $('#loader-text').text("Error leyendo el CSV.");
            $('#loader-text').css("color", "red");
        }
    });

    $('#btnLimpiar').click(() => { $('.form-select').val(null).trigger('change'); filtrarYActualizar(); });
    $('.form-select').on('change', function () { if (!actualizando) filtrarYActualizar(); });
});

function populateSelects() {
    // f_tipo_tienda se llenará solo con DETALLE/MAYOREO porque lookups.tipo_tienda ya no tiene 'CEDIS'
    const keys = [{id: 'f_empresa', data: lookups.empresa}, {id: 'f_cat_tienda', data: lookups.cat_tienda}, {id: 'f_tipo_tienda', data: lookups.tipo_tienda}, {id: 'f_tienda', data: lookups.tienda}, {id: 'f_division', data: lookups.division}, {id: 'f_categoria', data: lookups.categoria}, {id: 'f_grupo', data: lookups.grupo}];
    keys.forEach(k => {
        const select = $(`#${k.id}`); select.empty();
        Array.from(k.data).sort().forEach(val => { select.append(new Option(val, val, false, false)); });
    });
}

function getFiltros() {
    return { emp: $('#f_empresa').val() || [], catT: $('#f_cat_tienda').val() || [], tipo: $('#f_tipo_tienda').val() || [], tda: $('#f_tienda').val() || [], div: $('#f_division').val() || [], cat: $('#f_categoria').val() || [], grp: $('#f_grupo').val() || [] };
}

function filtrarYActualizar() {
    actualizando = true; const f = getFiltros();
    let filtered = globalData.filter(d => {
        if (f.emp.length && !f.emp.includes(d.emp)) return false;
        if (f.catT.length && !f.catT.includes(d.catT)) return false;
        // El filtro de tipo de tienda funciona contra la clasificación DETALLE/MAYOREO
        if (f.tipo.length && !f.tipo.includes(d.tipo)) return false;
        if (f.tda.length && !f.tda.includes(d.tda)) return false;
        if (f.div.length && !f.div.includes(d.div)) return false;
        if (f.cat.length && !f.cat.includes(d.cat)) return false;
        if (f.grp.length && !f.grp.includes(d.grp)) return false;
        return true;
    });
    actualizarKPIs(filtered); actualizarGraficos(filtered); actualizarTablas(filtered); actualizando = false;
}

function actualizarKPIs(data) {
    let v_ant = 0, v_act = 0, dif = 0, s_tda = 0, s_cedis = 0;
    data.forEach(d => { 
        v_ant += d.v_ant; 
        v_act += d.v_act; 
        dif += d.dif; 
        
        // Sumamos saldos usando la clasificación interna is_cedis
        if (d.is_cedis) {
            s_cedis += d.s_act; 
        } else {
            s_tda += d.s_act; 
        }
    });
    
    $('#kpiVtaPas').text(formatNum(v_ant)); 
    $('#kpiVtaAct').text(formatNum(v_act)); 
    $('#kpiDifVta').text(formatNum(dif));
    $('#kpiSaldTienda').text(formatNum(s_tda)); 
    $('#kpiSaldCedis').text(formatNum(s_cedis)); 
    $('#kpiSaldTotal').text(formatNum(s_tda + s_cedis));
}

function actualizarTablas(data) {
    let resG = {}, resT = {};
    data.forEach(d => {
        const kG = d.div + '|' + d.cat + '|' + d.grp;
        if(!resG[kG]) resG[kG] = {div: d.div, cat: d.cat, grp: d.grp, va:0, vc:0, dif:0, s_tda:0, s_ced:0};
        resG[kG].va += d.v_ant; resG[kG].vc += d.v_act; resG[kG].dif += d.dif;
        if(d.is_cedis) resG[kG].s_ced += d.s_act; else resG[kG].s_tda += d.s_act;

        // La tabla de tiendas también mostrará la clasificación DETALLE/MAYOREO en la columna tipo
        const kT = d.emp + '|' + d.catT + '|' + d.tipo + '|' + d.tda;
        if(!resT[kT]) resT[kT] = {emp: d.emp, catT: d.catT, tipo: d.tipo, tda: d.tda, va:0, vc:0, dif:0, s_act:0};
        resT[kT].va += d.v_ant; resT[kT].vc += d.v_act; resT[kT].dif += d.dif; resT[kT].s_act += d.s_act;
    });

    const arrG = Object.values(resG).map(i => [i.div, i.cat, i.grp, formatNum(i.va), formatNum(i.vc), formatNum(i.dif), formatNum(i.s_tda), formatNum(i.s_ced), formatNum(i.s_tda + i.s_ced)]);
    const arrT = Object.values(resT).map(i => [i.emp, i.catT, i.tipo, i.tda, formatNum(i.va), formatNum(i.vc), formatNum(i.dif), formatNum(i.s_act)]);

    tablaG.clear(); tablaG.rows.add(arrG); tablaG.draw(false);
    tablaT.clear(); tablaT.rows.add(arrT); tablaT.draw(false);
}

function actualizarGraficos(data) {
    let catMap = {}, divMap = {};
    data.forEach(d => { catMap[d.cat] = (catMap[d.cat] || 0) + d.v_act; divMap[d.div] = (divMap[d.div] || 0) + d.v_act; });
    const topCat = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const topDiv = Object.entries(divMap).sort((a,b)=>b[1]-a[1]).slice(0,10);

    if(chart1) chart1.destroy();
    chart1 = new Chart($('#chartCategorias'), { type: 'bar', data: { labels: topCat.map(x=>x[0].substring(0,15)), datasets: [{ label: 'Venta Actual', data: topCat.map(x=>x[1]), backgroundColor: '#012094' }] }, options: { maintainAspectRatio: false, plugins: { datalabels: { color: '#000', anchor: 'end', align: 'top', formatter: v=>formatNum(v) }, legend: {display: false}, title: {display:true, text:'Top 10 Categorías'} } } });

    if(chart2) chart2.destroy();
    chart2 = new Chart($('#chartDivisiones'), { type: 'bar', data: { labels: topDiv.map(x=>x[0].substring(0,15)), datasets: [{ label: 'Venta Actual', data: topDiv.map(x=>x[1]), backgroundColor: '#E1251B' }] }, options: { maintainAspectRatio: false, plugins: { datalabels: { color: '#000', anchor: 'end', align: 'top', formatter: v=>formatNum(v) }, legend: {display: false}, title: {display:true, text:'Top 10 Divisiones'} } } });
}
