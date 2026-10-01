with open('src/game/GameProvider.tsx', 'r') as f:
    lines = f.readlines()

fixed_any = False
for i, line in enumerate(lines):
    if 'mensaje:' in line and 'EVENTO |' in line:
        print(f'Line {i+1}: {line.rstrip()}')
        # Build the new line
        new_line = "          mensaje: expTag + 'EVENTO | ' + ev.text + (parts.length > 0 ? ' (' + parts.join(' · ') + ')' : ''),\n"
        lines[i] = new_line
        print(f'Fixed: {new_line.rstrip()}')
        fixed_any = True
        break

if not fixed_any:
    print('Line with EVENTO | mensaje not found!')

with open('src/game/GameProvider.tsx', 'w') as f:
    f.writelines(lines)
print('Done')
