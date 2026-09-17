/**
 * Carga los fragmentos HTML (partials/*.html) declarados en index.html vía
 * el atributo data-partial, e inyecta cada uno dentro de su contenedor.
 *
 * Se resuelve ANTES de arrancar el resto de main.js: todo lo demás
 * (initTabs, initRecords, wireLoginForm, etc.) hace document.getElementById
 * sobre elementos que hoy en día viven dentro de esos fragmentos, así que
 * tienen que existir en el DOM antes de que ese código corra.
 *
 * No requiere build ni bundler: son archivos .html sueltos que se piden
 * por fetch() y se insertan con innerHTML, tal cual los sirve el propio
 * servidor estático (dev-server.js en local, Vercel en producción).
 */
export async function loadPartials() {
  const nodos = Array.from(document.querySelectorAll('[data-partial]'));
  await Promise.all(nodos.map(async (el) => {
    const ruta = el.getAttribute('data-partial');
    try {
      const res = await fetch(ruta);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      el.innerHTML = await res.text();
    } catch (err) {
      console.error(`No se pudo cargar el fragmento "${ruta}":`, err);
      el.innerHTML = `<p style="padding:1rem;color:#f66;font:12px monospace">Error cargando ${ruta}</p>`;
    }
  }));
}
