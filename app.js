// ==========================================
// app.js - Lógica Dinámica y Corrección de CEDIS
// ==========================================

let globalData = [];
let chart1 = null, chart2 = null, tablaG = null, tablaT = null;
let actualizando = false;

let lookups = { 
    empresa: new Set(), cat_tienda: new Set(), tipo_tienda: new Set(), 
    tienda: new Set(), division: new Set(), categoria: new Set(), grupo: new Set() 
};

function formatNum(num) { 
    return Number(num).toLocaleString('en-US', { maximumFractionDigits: 0 }); 
}

function formatBadge(num) {
    if (num > 0) return `<span class="badge-positivo" style="color: #0f5132; font-weight: bold; background-color: #d1e7dd; padding: 3px 8px; border-radius: 4px;">${formatNum(num)}</span>`;
    if (num < 0) return `<span class="badge-negativo" style="color: #842029; font-weight: bold; background-color: #f8d7da; padding: 3px 8px; border-radius: 4px;">${formatNum(num)}</span>`;
    return `<span class="badge-neutro" style="color: #495057; font-weight: bold; background-color: #e9ecef; padding: 3px 8px; border-radius: 4px;">0</span>`;
}

function formatState(state) {
    if (!state.id) return state.text;
    var $cb = $('<input type="checkbox" class="select2-checkbox">');
    if (state.selected) $cb.prop('checked', true);
    return $('<span></span>').append($cb).append(' ' + state.text);
}

// 1. REGLA EMPRESA
function determineEmpresa(name) {
    name = String(name).toUpperCase();
    if (name.includes('DS') || name.includes('VITRINA')) return 'DANILOS STORE';
    return 'EL COMPADRE';
}

function cleanNumber(val) {
    if (val === null || val === undefined) return 0;
    let cleanedString = String(val).replace(/,/g, '').replace(/\s/g, '').replace('$', '');
    let parsed = parseFloat(cleanedString);
    return isNaN(parsed) ? 0 : parsed;
}

function getColValue(row, possibleNames) {
    for (let name of possibleNames) { if (row[name] !== undefined) return row[name]; }
    return 0; 
}

$(document).ready(function () {
    Chart.register(ChartDataLabels);
    $('.form-select').select2({ theme: 'bootstrap-5', placeholder: 'Todas...', allowClear: true, closeOnSelect: false, templateResult: formatState });

    const conf = { language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, pageLength: 20, deferRender: true };
    tablaG = $('#tablaGrupo').DataTable(conf);
    tablaT = $('#tablaTienda').DataTable(conf);

    Papa.parse("reporte_ventas_unidades_2025_2026.csv", {
        download: true,
        header: true,
        delimiter: ";", 
        skipEmptyLines: true,
        dynamicTyping: false,
        chunk: function(results) {
            results.data.forEach(row => {
                const tdaName = getColValue(row, ['Name', 'name', 'Tienda', 'tienda', 'Nombre']);
                const grpName = getColValue(row, ['Grupo', 'grupo', 'GRUPO']);
                
                if (!tdaName || !grpName) return; 
                
                const upperName = String(tdaName).toUpperCase();
                const empresa = determineEmpresa(upperName);
                const catT = getColValue(row, ['Categoria_Tienda', 'categoria_tienda', 'Cat_Tienda', 'Categoria Tienda']) || 'N/A';
                
                // =========================================================
                // CORRECCIÓN CRÍTICA DE LÓGICA (Separar Bodega de Filtro)
                // =========================================================
                
                // A) ¿Actúa como un CEDIS/Almacén para los cálculos de inventario?
                const isCedisInterno = upperName.includes('CD ') || upperName.includes('CEDIS') || upperName.includes('MEGABODEGA') || String(catT).toUpperCase() === 'ALMACEN';
                
                // B) ¿Bajo qué nombre debe salir en el Filtro Desplegable del usuario? (Solo Mayoreo/Detalle)
                let tipoFilter = 'DETALLE';
                if (upperName.includes('MAYOREO') || upperName.includes('MEGABODEGA') || upperName.includes('AEC') || upperName.includes('DS') || isCedisInterno) {
                    tipoFilter = 'MAYOREO';
                }
                
                const div = getColValue(row, ['Division', 'division', 'DIVISION']) || 'N/A';
                const cat = getColValue(row, ['Categoria', 'categoria', 'CATEGORIA']) || 'N/A';
                
                // C) Lectura invertida de saldos
                let s_act = 0, s_ant = 0;
                if (row['saldo_actual'] !== undefined || row['saldo_pasado'] !== undefined) {
                    s_act = cleanNumber(row['saldo_actual']); s_ant = cleanNumber(row['saldo_pasado']);
                } else {
                    s_act = cleanNumber(getColValue(row, ['Saldo_Anterior', 'Saldo Anterior']));
                    s_ant = cleanNumber(getColValue(row, ['Saldo_Actual', 'Saldo Actual']));
                }

                const v_act = cleanNumber(getColValue(row, ['Venta_Und_Actual', 'venta_actual', 'Venta Actual', 'VENTA_ACTUAL']));
                const v_ant = cleanNumber(getColValue(row, ['Venta_Und_Anterior', 'venta_pasada', 'Venta Anterior', 'VENTA_ANTERIOR']));
                const dif = cleanNumber(getColValue(row, ['Diferencia_Und', 'diferencia', 'Diferencia Und', 'DIFERENCIA']));

                lookups.empresa.add(empresa); lookups.cat_tienda.add(catT); 
                lookups.tipo_tienda.add(tipoFilter); // El dropdown será limpio
                lookups.tienda.add(tdaName); lookups.division.add(div); lookups.categoria.add(cat); lookups.grupo.add(grpName);

                globalData.push({
                    emp: empresa, catT: catT, tipoFiltro: tipoFilter, 
                    tda: tdaName, div: div, cat: cat, grp: grpName,
                    s_ant: s_ant, s_act: s_act, v_ant: v_ant, v_act: v_act, dif: dif, is_cedis: isCedisInterno
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
            $('#loader-text').text("Error leyendo el CSV. Asegúrate de que el nombre del archivo coincida.");
            $('#loader-text').css("color", "red");
        }
    });

    $('#btnLimpiar').click(() => { $('.form-select').val(null).trigger('change'); filtrarYActualizar(); });
    $('.form-select').on('change', function () { if (!actualizando) filtrarYActualizar(); });
});

function populateSelects() {
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
        if (f.tipo.length && !f.tipo.includes(d.tipoFiltro)) return false;
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
        v_ant += d.v_ant; v_act += d.v_act; dif += d.dif; 
        if (d.is_cedis) s_cedis += d.s_act; else s_tda += d.s_act; 
    });
    $('#kpiVtaPas').text(formatNum(v_ant)); $('#kpiVtaAct').text(formatNum(v_act)); $('#kpiDifVta').text(formatNum(dif));
    $('#kpiSaldTienda').text(formatNum(s_tda)); $('#kpiSaldCedis').text(formatNum(s_cedis)); $('#kpiSaldTotal').text(formatNum(s_tda + s_cedis));
}

function actualizarTablas(data) {
    let resG = {}, resT = {};
    let cedisStockByGrupo = {};

    // 1er paso: Rescatar el inventario de las bodegas/almacenes/cedis
    data.forEach(d => {
        if (d.is_cedis) {
            const kBodega = d.emp + '|' + d.grp; // Agrupado por empresa y grupo
            if (!cedisStockByGrupo[kBodega]) cedisStockByGrupo[kBodega] = { pas: 0, act: 0 };
            cedisStockByGrupo[kBodega].pas += d.s_ant;
            cedisStockByGrupo[kBodega].act += d.s_act;
        }
    });

    let tiendaGruposCheck = {}; 

    // 2do paso: Llenar las tablas asignando los saldos correctamente
    data.forEach(d => {
        // --- TABLA POR GRUPO ---
        const kG = d.div + '|' + d.cat + '|' + d.grp;
        if(!resG[kG]) resG[kG] = {div: d.div, cat: d.cat, grp: d.grp, va:0, vc:0, dif:0, s_tda_pas:0, s_tda_act:0, s_ced_pas:0, s_ced_act:0};
        resG[kG].va += d.v_ant; resG[kG].vc += d.v_act; resG[kG].dif += d.dif;
        if(d.is_cedis) { resG[kG].s_ced_pas += d.s_ant; resG[kG].s_ced_act += d.s_act; } 
        else { resG[kG].s_tda_pas += d.s_ant; resG[kG].s_tda_act += d.s_act; }

        // --- TABLA POR TIENDA ---
        const kT = d.catT + '|' + d.tipoFiltro + '|' + d.tda;
        if(!resT[kT]) {
            resT[kT] = {emp: d.emp, catT: d.catT, tipo: d.tipoFiltro, tda: d.tda, isCedisRow: d.is_cedis, va:0, vc:0, dif:0, s_tda_pas:0, s_tda_act:0, s_ced_pas:0, s_ced_act:0};
            tiendaGruposCheck[kT] = new Set();
        }
        resT[kT].va += d.v_ant; resT[kT].vc += d.v_act; resT[kT].dif += d.dif;
        
        if (d.is_cedis) {
            // Si la línea ES el CEDIS/Megabodega, su saldo va a las columnas de CEDIS. Tienda queda en 0.
            resT[kT].s_ced_pas += d.s_ant; resT[kT].s_ced_act += d.s_act;
        } else {
            // Si la línea es una Tienda normal, su saldo va a la columna de Tienda
            resT[kT].s_tda_pas += d.s_ant; resT[kT].s_tda_act += d.s_act;
            
            // Le adjuntamos el saldo de su CEDIS respectivo para los grupos que vende
            const kBodega = d.emp + '|' + d.grp;
            if (!tiendaGruposCheck[kT].has(kBodega)) {
                tiendaGruposCheck[kT].add(kBodega);
                if (cedisStockByGrupo[kBodega]) {
                    resT[kT].s_ced_pas += cedisStockByGrupo[kBodega].pas;
                    resT[kT].s_ced_act += cedisStockByGrupo[kBodega].act;
                }
            }
        }
    });

    const arrG = Object.values(resG).map(i => [
        i.div, i.cat, i.grp, formatNum(i.va), formatNum(i.vc), formatBadge(i.dif),
        formatNum(i.s_tda_pas), formatNum(i.s_tda_act), formatNum(i.s_ced_pas), formatNum(i.s_ced_act), 
        formatNum(i.s_tda_pas + i.s_ced_pas), formatNum(i.s_tda_act + i.s_ced_act)
    ]);

    const arrT = Object.values(resT).map(i => [
        i.catT, i.tipo, i.tda, formatNum(i.va), formatNum(i.vc), formatBadge(i.dif),
        formatNum(i.s_tda_pas), formatNum(i.s_tda_act), formatNum(i.s_ced_pas), formatNum(i.s_ced_act),
        formatNum(i.s_tda_pas + i.s_ced_pas), formatNum(i.s_tda_act + i.s_ced_act)
    ]);

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
