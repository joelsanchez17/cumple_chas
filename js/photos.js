'use strict';

(() => {
  // Permanent application IDs: never renumber, derive from filenames or recycle.
  // Reordering this list or changing an asset must preserve each existing ID.
  // Future guest memories should receive their own permanent IDs.
  const photoSource = 'assets/images/chas/';
  const memory = (id, file, title, description, tags, extra = {}) => ({
    id, src: photoSource + encodeURIComponent(`WhatsApp Image 2026-10-29 at ${file}.jpeg`),
    title, description, tags, origin: 'seed', ...extra,
  });
  window.chasMemories = Object.freeze([
    memory('chas-memory-001', '15.02.07 (2)', 'Una sonrisa al sol', 'Yo, al sol, con mi chaqueta de cuero y una sonrisa que casi no cabe en la foto.', ['everyday']),
    memory('chas-memory-002', '14.01.29_7', 'Las pelucas tienen historia', 'Yo con peluca roja, en buena compañía. La violeta y las gafas de corazón también merecen su explicación.', ['costumes', 'friends']),
    memory('chas-memory-003', '14.00.36', 'Debajo de mil colores', 'Yo, un vaso verde y un techo de paraguas de colores. El paseo ya tenía su propia decoración.', ['travel', 'everyday'], { position: 'center 65%' }),
    memory('chas-memory-004', '15.02.06 (2)', 'Un capítulo y algo rico', 'Mi libro abierto, algo rico en la mesa y yo haciendo una pausa entre páginas.', ['everyday']),
    memory('chas-memory-005', '14.00.36_3', 'Así, con los brazos abiertos', 'Yo con los brazos abiertos y los ojos cerrados, disfrutando un ratito en plena calle.', ['everyday']),
    memory('chas-memory-006', '15.02.07 (4)', 'La noche también se pasea', 'Mi foto frente a la pirámide del Louvre. Las manos salieron movidas; la intención se entiende.', ['travel']),
    memory('chas-memory-007', '15.02.07 (7)', 'El reparto completo', 'Acá estoy con cinco personas más y unos cuantos disfraces. Hay bastante contexto pendiente.', ['friends', 'costumes']),
    memory('chas-memory-008', '14.01.29_6', 'Mi primer capítulo', 'Yo de pequeña, con vestido rosa y botas. El espejo guardó la otra versión de la foto.', ['everyday']),
    memory('chas-memory-009', '14.00.3_2', 'Una más y nos vamos…', 'Una selfie en plena salida, con compañía, luces y mucha gente alrededor.', ['friends']),
    memory('chas-memory-010', '14.01.29_4', 'Un guiño por aquí', 'Mi guiño junto a una barandilla roja, entre bambú y una pequeña cascada.', ['travel', 'everyday']),
    memory('chas-memory-011', '14.01.29_5', 'Hoy toca otra versión', 'Yo con maquillaje de disfraz y adornos en el pelo. Discreta no salió la pose.', ['costumes']),
    memory('chas-memory-012', '15.02.06 (1)', 'Un ratito en las alturas', 'Yo en una terraza, con la ciudad detrás y una sonrisa de esas que salen sin pensarlo.', ['everyday', 'travel']),
    memory('chas-memory-013', '15.02.06', 'Una pausa para el café', 'Mi pausa para el café, con la taza entre las manos y la calle de fondo.', ['everyday']),
    memory('chas-memory-014', '15.02.07 (1)', 'Mejor en compañía', 'Una selfie en compañía junto al agua. Detrás quedó ese edificio de torre y tejado verde.', ['travel', 'friends']),
    memory('chas-memory-015', '15.02.07 (3)', 'Ni el frío me borra la sonrisa', 'Yo bien abrigada frente a un muro pintado. La lluvia también se vino a la foto.', ['travel']),
    memory('chas-memory-016', '15.02.07 (5)', 'Algo calentito entre luces', 'Yo en compañía, con una taza entre las manos y todas las luces del puesto detrás.', ['travel', 'friends']),
    memory('chas-memory-017', '15.02.07 (8)', 'La ciudad de fondo. Mi gente, primero.', 'Yo compartiendo un abrazo en un puente. El río y la ciudad pusieron las luces.', ['travel', 'friends'], { wide: true }),
    memory('chas-memory-018', '15.02.07 (9)', 'El paseo tomó otro rumbo', 'Yo a caballito en una plaza iluminada. Si tienes el contexto, este es el momento de contarlo.', ['travel', 'friends']),
    memory('chas-memory-019', '15.02.07', 'Y que siga la aventura', 'Yo saludando junto al río, con mis guantes rojos y una torre iluminada a lo lejos.', ['travel']),
  ].map((item) => Object.freeze({ ...item, tags: Object.freeze(item.tags) })));
})();
