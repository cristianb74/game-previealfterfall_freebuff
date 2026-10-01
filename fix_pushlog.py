with open('src/game/GameProvider.tsx', 'r') as f:
    content = f.read()

# Define replacements for old-style pushLog calls
replacements = [
    # EXPLORATION: finish line
    ("pushLog(s, `Nueva zona desbloqueada: ${getZone(maxUnlocked).name}`, \"zone\", startedAt);",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'ZONA', subtype: 'desbloqueada', fields: { zona: getZone(maxUnlocked).id }, mensaje: `Nueva zona desbloqueada: ${getZone(maxUnlocked).name}` });"),
    
    # DISCOVER NPC
    ("pushLog(s, `[EXP #${expId}] NPC CHECK | contador ${counter} | ${via} | probabilidad ${(chance * 100).toFixed(1)}% | resultado NO`, \"info\", startedAt);",
     "pushLog(s, { zona: undefined, origen: via === 'AUTO' ? 'auto' : 'manual', category: 'NPC CHECK', subtype: 'check', fields: { contador: counter, vía: via, probabilidad: (chance * 100).toFixed(1) }, mensaje: `[EXP #${expId}] NPC CHECK | contador ${counter} | ${via} | probabilidad ${(chance * 100).toFixed(1)}% | resultado NO` });"),
    
    # DISCOVER NPC success
    ("pushLog(s, `[EXP #${expId}] NPC OBTENIDO (${via}) | ${npc.id} · ${npc.name} · ${NPC_TYPE_MODIFIERS[npc.type].label}`, \"npc\", startedAt);",
     "pushLog(s, { zona: undefined, origen: via === 'AUTO-FARM' ? 'auto' : 'manual', category: 'NPC_ACTION', subtype: 'hallazgo', fields: { npc: npc.id, nombre: npc.name, tipo: NPC_TYPE_MODIFIERS[npc.type].label }, mensaje: `[EXP #${expId}] NPC OBTENIDO (${via}) | ${npc.id} · ${npc.name} · ${NPC_TYPE_MODIFIERS[npc.type].label}` });"),
    
    # CONTADOR REINICIADO
    ("pushLog(s, `[NPC] contador reiniciado a 0`, \"info\", vnow());",
     "pushLog(s, { zona: undefined, origen: 'auto', category: 'NPC_ACTION', subtype: 'contador_reiniciado', mensaje: `[NPC] contador reiniciado a 0` });"),

    # SCAVENGE EVENT
    ("pushLog(s, `[EXP #${expId}] EVENTO | ${loc.name} detectada · minijuego SCAVENGE`, \"info\", vnow());",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'NPC_ACTION', subtype: 'evento', fields: { minijuego: 'SCAVENGE' }, mensaje: `[EXP #${expId}] EVENTO | ${loc.name} detectada · minijuego SCAVENGE` });"),

    # SCAVENGE EVENT (auto)
    ("pushLog(s, `[EXP #${expId}] EVENTO | ${loc.name} detectada · minijuego SCAVENGE (auto)`, \"info\", startedAt);",
     "pushLog(s, { zona: undefined, origen: 'auto', category: 'NPC_ACTION', subtype: 'evento', fields: { minijuego: 'SCAVENGE' }, mensaje: `[EXP #${expId}] EVENTO | ${loc.name} detectada · minijuego SCAVENGE (auto)` });"),

    # SCAVENGE result lines
    ("pushLog(s, `EVENTO | SCAVENGE · ${line} — ${r.text}`, r.kind === \"dano\" ? \"damage\" : \"resource\", startedAt);",
     "pushLog(s, { zona: undefined, origen: 'auto', category: r.kind === 'dano' ? 'SCAVENGE' : 'SCAVENGE', subtype: r.kind === 'dano' ? 'daño' : r.kind === 'loot' ? 'hallazgo' : 'nada', fields: { resultado: line, texto: r.text }, mensaje: `EVENTO | SCAVENGE · ${line} — ${r.text}` });"),

    # CRAFTING COMPLETED
    ("pushLog(s, `Crafteo completado: ${name}`, \"info\");",
     "pushLog(s, { origen: 'auto', category: 'CRAFTEO', subtype: 'fin', fields: { item: name, resultado: 'exito' }, mensaje: `Crafteo completado: ${name}` });"),
    
    # CRAFTING in catch-up
    ("pushLog(s, `Crafteo completado: ${name}`, \"info\");",
     "pushLog(s, { origen: 'auto', category: 'CRAFTEO', subtype: 'fin', fields: { item: name, resultado: 'exito' }, mensaje: `Crafteo completado: ${name}` });"),
    
    # CRAFTING in catch-up timer
    ("pushLog(s, `Crafteo completado: ${name}`, \"info\");",
     "pushLog(s, { origen: 'auto', category: 'CRAFTEO', subtype: 'fin', fields: { item: name, resultado: 'exito' }, mensaje: `Crafteo completado: ${name}` });"),
    
    # SCAVENGE search
    ("pushLog(s, `EVENTO | SCAVENGE · ${line} — ${result.text}`, result.kind === \"dano\" ? \"damage\" : \"resource\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: result.kind === 'dano' ? 'SCAVENGE' : 'SCAVENGE', subtype: result.kind === 'dano' ? 'daño' : result.kind === 'loot' ? 'hallazgo' : 'nada', fields: { resultado: line, texto: result.text }, mensaje: `EVENTO | SCAVENGE · ${line} — ${result.text}` });"),
    
    # SCAVENGE close
    ("pushLog(s, `EVENTO | SCAVENGE cerrado · ${summary}`, \"resource\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'SCAVENGE', subtype: 'fin', fields: { hallazgos: summary }, mensaje: `EVENTO | SCAVENGE cerrado · ${summary}` });"),
    
    # SCAVENGE close (no loot)
    ("pushLog(s, \"EVENTO | SCAVENGE cerrado sin hallazgos\", \"info\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'SCAVENGE', subtype: 'fin', mensaje: 'EVENTO | SCAVENGE cerrado sin hallazgos' });"),
    
    # AUTO-EXPLORE activate
    ("pushLog(s, `Auto-exploración activada en ${zoneName}`, \"info\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'AUTO_EXPLORER', subtype: 'ciclo_iniciado', fields: { zonas: getZone(zoneId).id, estado: 'activada' }, mensaje: `Auto-exploración activada en ${zoneName}` });"),
    
    # AUTO-EXPLORE deactivate
    ("pushLog(s, `Auto-exploración desactivada en ${zoneName}`, \"info\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'AUTO_EXPLORER', subtype: 'ciclo_fin', fields: { zonas: getZone(zoneId).id, estado: 'desactivada' }, mensaje: `Auto-exploración desactivada en ${zoneName}` });"),
    
    # ASSIGN NPC - assigned
    ("pushLog(s, `${npcDisplayName(npc)} asignado a ${getZone(zoneId).name}`, \"npc\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'NPC_ACTION', subtype: 'asignado', fields: { npc: npc.id, zona_anterior: npc.assignedZoneId ?? 'sin_asignar', zona_nueva: getZone(zoneId).id }, mensaje: `${npcDisplayName(npc)} asignado a ${getZone(zoneId).name}` });"),
    
    # ASSIGN NPC - unassigned
    ("pushLog(s, `${npcDisplayName(npc)} sin asignación`, \"npc\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'NPC_ACTION', subtype: 'reasignado', fields: { npc: npc.id, zona_anterior: getZone(npc.assignedZoneId).id, zona_nueva: getZone(zoneId).id }, mensaje: `${npcDisplayName(npc)} sin asignación` });"),
    
    # UPGRADE BASE BUILDING
    ("pushLog(s, `Mejora iniciada: ${BUILDING_BY_KEY[key].name} N${b.level + 1} (Base global)`, \"build\");",
     "pushLog(s, { zona: 'Base global', origen: 'auto', category: 'CONSTR', subtype: 'completada', fields: { construcción: BUILDING_BY_KEY[key].name, nivel: b.level }, mensaje: `Mejora iniciada: ${BUILDING_BY_KEY[key].name} N${b.level + 1} (Base global)` });"),
    
    # UPGRADE THEMATIC BUILDING
    ("pushLog(s, `Mejora iniciada: ${def.name} N${b.level + 1} (Z${String(zoneId).padStart(2, \"0\")})`, \"build\");",
     "pushLog(s, { zona: `Z${String(zoneId).padStart(2, \"0\")}`, origen: 'auto', category: 'CONSTR', subtype: 'completada', fields: { construcción: def.name, nivel: b.level }, mensaje: `Mejora iniciada: ${def.name} N${b.level + 1} (Z${String(zoneId).padStart(2, \"0\")})` });"),
    
    # OBJECT USED
    ("pushLog(s, `Objeto usado · ${result}`, \"info\");",
     "pushLog(s, { zona: undefined, origen: 'auto', category: 'USO_ITEM', subtype: 'consumido', mensaje: `Objeto usado · ${result}` });"),
    
    # MERCHANT buy/buyBattery
    ("pushLog(s, `Mercader: +${offer.amount * q}${key === \"comida\" || key === \"agua\" ? \" min\" : \"\"} ${key} · -$${total}`, \"resource\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'MERCADER', subtype: 'compra', fields: { item: key, cantidad: offer.amount * q, precio: total }, mensaje: `Mercader: +${offer.amount * q}${key === 'comida' || key === 'agua' ? ' min' : ''} ${key} · -$${total}` });"),
    
    ("pushLog(s, `Mercader: ${MERCHANT_BATTERY_OFFER.label} +${MERCHANT_BATTERY_OFFER.energy * q} Energía · -$${total}`, \"resource\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'MERCADER', subtype: 'compra', fields: { item: 'batería', cantidad: MERCHANT_BATTERY_OFFER.energy * q, precio: total }, mensaje: `Mercader: ${MERCHANT_BATTERY_OFFER.label} +${MERCHANT_BATTERY_OFFER.energy * q} Energía · -$${total}` });"),
    
    # MERCHANT sell
    ("pushLog(s, `[MERCADER] Venta · -${sellAmount} ${key === \"comida\" || key === \"agua\" ? `min ${key}` : key} · +$${totalMoney}`, \"resource\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'MERCADER', subtype: 'venta', fields: { item: key, cantidad: sellAmount, precio: totalMoney }, mensaje: `[MERCADER] Venta · -${sellAmount} ${key === 'comida' || key === 'agua' ? 'min ' + key : key} · +$${totalMoney}` });"),
    
    # NPC recruit
    ("pushLog(s, `[NPC] ${npc.id} · ${npc.name} reclutado · -${matCost} Materiales · -${foodCost} min Comida`, \"npc\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'NPC_ACTION', subtype: 'reclutado', fields: { npc: npc.id, nombre: npc.name, costo_materiales: matCost, costo_comida: foodCost }, mensaje: `[NPC] ${npc.id} · ${npc.name} reclutado · -${matCost} Materiales · -${foodCost} min Comida` });"),
    
    # NPC expel
    ("pushLog(s, `[NPC] ${npc.id} · ${npc.name} expulsada del refugio`, \"npc\");",
     "pushLog(s, { zona: undefined, origen: 'manual', category: 'NPC_ACTION', subtype: 'expulsado', fields: { npc: npc.id, nombre: npc.name }, mensaje: `[NPC] ${npc.id} · ${npc.name} expulsada del refugio` });"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f'Fixed: {old[:60]}...')
    else:
        print(f'NOT FOUND: {old[:60]}...')

with open('src/game/GameProvider.tsx', 'w') as f:
    f.write(content)
print('Done')
