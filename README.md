# Kvasir Graph

Open **index.html** in Edge, Chrome, or Firefox. The editor runs locally with no installation, server, or internet connection.

Kvasir Graph uses the [PolyForm Noncommercial License 1.0.0](LICENSE). It permits using, modifying, and sharing the editor for noncommercial purposes.

Required Notice: Copyright 2026 Brandon Born

## Make a graph

1. Choose **New graph → Start with → Supply and demand equations** to plot one or both linear equations. Enter quantity form (such as `Qd = 136 - 2P` and `Qs = 3P - 69`) or inverse form (such as `P = 23 + Q/3`). Check the axis preview, then choose **Create graph**. **Mark equilibrium** (on by default) adds point E with dashed guides to both axes and shows its exact Q and P. Each curve keeps its equation: double-click it to change the equation (the axes expand automatically if the new line runs off the graph), and **Axes & scale** redraws equation curves to span the new axes. For manual drawing, choose **Blank graph** and set the axis limits yourself. **Axes & scale** changes either axis later.
2. Choose **Draw → Straight line** and click two points. For exact intercepts, use **Enter coordinates**. Use **Draw → U-shaped** to place a minimum, then drag either arm. **Freehand** smooths a mouse or pen stroke.
3. To mark where two curves cross, select one and choose **Mark equilibrium**. Later points are named E₁, E₂, and so on. Use **Point** to mark any other crossing. With **Guide → Auto**, click the intersection and then click near either axis, or drag from the intersection to the axis. The price axis gets a horizontal guide and the quantity axis gets a vertical guide. The preview shows the exact endpoint. Choose **Any angle** for a diagonal guide, or hold **Alt** to pause snapping.
4. Click **Shade**, click a bounded area, and enter its label and color. To combine several pieces under one label, select the area in **Graph objects**, choose **Add area**, and click the adjoining pieces.
5. With **Select**, drag a curve, its handles, or its label. Double-click an object to edit it, or right-click it to see the same actions as in the sidebar. Both shortcuts also work in **Graph objects**. Double-click an axis title to open **Axes & scale**. A U-shaped curve's minimum stays attached when snapped to MC. **Detach** releases its anchors.
6. The **•••** menu beside the title duplicates or renames a graph. To compare supply curves, duplicate the graph, select supply, and use **Copy & shift** with a quantity shift of 0 and the desired price shift.

When naming a point, curve, axis, area, or free-text label, use **Size (px)** to adjust its font size. Click **x₂ Subscript** after the base text to insert a subscript. Type over the selected **1** for a different suffix, or highlight existing letters and click the button to lower them. The preview shows the formatted label.

## Save and export

The browser saves edits on this device. **Export → Save editable workspace** downloads all graphs as JSON and lets you move them between browsers or computers. **••• → Open workspace backup** adds the saved graphs to the current workspace.

Use **Export → Copy graph for Word** or **Download PNG** to insert a figure into the assignment. SVG is available for vector graphics. **Print or save PDF** prints the active graph. Keyboard shortcuts include Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Delete or Backspace, and Escape. If saved data on this device can't be opened, the editor keeps a copy and **••• → Download unopened saved data** retrieves it.

## Source

The editor uses native SVG and browser pointer events. **geometry.js** splits curves and guides at intersections and builds closed faces. **model.js** resolves snapped anchors and stores graph objects. **app.js** implements drawing, editing, persistence, and export. Run the regression checks with `node --test`.
