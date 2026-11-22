-- DROP DATABASE IF EXISTS ledgera;   
CREATE DATABASE IF NOT EXISTS ledgera;
USE ledgera;


CREATE TABLE puestos (
  id_puesto INT AUTO_INCREMENT PRIMARY KEY,
  nombre_puesto VARCHAR(100) NOT NULL,
  ubicacion_bodega VARCHAR(100) NOT NULL DEFAULT 'Bodega 21 - Corabastos',
  umbral_descuadre DECIMAL(12,2) NOT NULL DEFAULT 1000.00,   -- diferencia de caja tolerada
  estado ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_puesto UNIQUE (nombre_puesto, ubicacion_bodega)
) ENGINE=InnoDB COMMENT='Puestos de venta en Corabastos';

CREATE TABLE usuarios (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  id_puesto INT NULL,                                
  usuario VARCHAR(50)  NOT NULL UNIQUE,
  nombre_completo  VARCHAR(150) NOT NULL,
  num_identificacion VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('Administrador','Dueno','Vendedor') NOT NULL,
  estado ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  intentos_fallidos INT NOT NULL DEFAULT 0,
  fecha_bloqueo DATETIME NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuarios_puestos FOREIGN KEY (id_puesto) REFERENCES puestos (id_puesto)
) ENGINE=InnoDB COMMENT='Usuarios con rol y control de acceso';

CREATE TABLE proveedores (
  id_proveedor INT AUTO_INCREMENT PRIMARY KEY,
  id_puesto INT NOT NULL,
  nombre_razon_social VARCHAR(150) NOT NULL,
  telefono VARCHAR(20) NULL,
  contacto_principal VARCHAR(100) NULL,
  estado ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_proveedor UNIQUE (id_puesto, nombre_razon_social),
  CONSTRAINT fk_proveedores_puestos FOREIGN KEY (id_puesto) REFERENCES puestos (id_puesto)
) ENGINE=InnoDB COMMENT='Proveedores de mercancía';

CREATE TABLE clientes (
  id_cliente INT AUTO_INCREMENT PRIMARY KEY,
  id_puesto INT NOT NULL,
  nombre_completo VARCHAR(150) NOT NULL,
  telefono VARCHAR(20)  NOT NULL,
  plazo_credito_dias INT NOT NULL DEFAULT 15,                 
  estado ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_cliente_telefono UNIQUE (id_puesto, telefono),
  CONSTRAINT fk_clientes_puestos FOREIGN KEY (id_puesto) REFERENCES puestos (id_puesto)
) ENGINE=InnoDB COMMENT='Clientes de crédito (fiado)';

CREATE TABLE productos (
  id_producto INT AUTO_INCREMENT PRIMARY KEY,
  id_puesto INT NOT NULL,
  nombre_producto VARCHAR(100) NOT NULL,
  descripcion TEXT NULL,
  estado ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  CONSTRAINT uk_producto UNIQUE (id_puesto, nombre_producto),
  CONSTRAINT fk_productos_puestos FOREIGN KEY (id_puesto) REFERENCES puestos (id_puesto)
) ENGINE=InnoDB COMMENT='Catálogo base de productos';

CREATE TABLE inventario_calidades (
  id_inventario INT AUTO_INCREMENT PRIMARY KEY,
  id_producto INT NOT NULL,
  calidad varchar (100) NOT NULL,
  stock_actual INT NOT NULL DEFAULT 0,                 -- lo mueven los triggers
  stock_minimo INT NOT NULL DEFAULT 0,
  precio_venta_diario DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  CONSTRAINT uk_producto_calidad UNIQUE (id_producto, calidad),
  CONSTRAINT fk_inv_productos FOREIGN KEY (id_producto) REFERENCES productos (id_producto)
) ENGINE=InnoDB COMMENT='Inventario por producto y calidad';

CREATE TABLE entradas_mercancia (
  id_entrada INT AUTO_INCREMENT PRIMARY KEY,
  id_puesto INT NOT NULL,
  id_proveedor INT NOT NULL,
  id_usuario INT NOT NULL,
  documento_soporte VARCHAR(50) NOT NULL,
  total_compra DECIMAL(12,2) NOT NULL DEFAULT 0.00,      -- lo suma el trigger con cada línea
  saldo_pendiente DECIMAL(12,2) NOT NULL DEFAULT 0.00,      -- lo que aún se le debe al proveedor
  estado_pago ENUM('Pendiente','Parcial','Pagado') NOT NULL DEFAULT 'Pendiente',
  fecha_entrada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_entrada_doc UNIQUE (id_proveedor, documento_soporte),
  CONSTRAINT fk_entradas_puestos FOREIGN KEY (id_puesto) REFERENCES puestos (id_puesto),
  CONSTRAINT fk_entradas_proveedores FOREIGN KEY (id_proveedor) REFERENCES proveedores (id_proveedor),
  CONSTRAINT fk_entradas_usuarios FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
) ENGINE=InnoDB COMMENT='Factura de compra al proveedor';

CREATE TABLE detalle_entrada (
  id_detalle_entrada INT AUTO_INCREMENT PRIMARY KEY,
  id_entrada INT NOT NULL,
  id_inventario INT NOT NULL,
  cantidad_recibida INT NOT NULL,
  costo_unitario DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(14,2) GENERATED ALWAYS AS (cantidad_recibida * costo_unitario) STORED,
  CONSTRAINT ck_det_entrada CHECK (cantidad_recibida > 0 AND costo_unitario > 0),
  CONSTRAINT fk_det_entrada_cab FOREIGN KEY (id_entrada) REFERENCES entradas_mercancia (id_entrada),
  CONSTRAINT fk_det_entrada_inv FOREIGN KEY (id_inventario) REFERENCES inventario_calidades (id_inventario)
) ENGINE=InnoDB COMMENT='Productos recibidos por calidad';

CREATE TABLE ventas (
  id_venta INT AUTO_INCREMENT PRIMARY KEY,
  id_puesto INT NOT NULL,
  id_usuario INT NOT NULL,
  id_cliente INT NULL,                                 
  canal ENUM('Mostrador','Domicilio') NOT NULL DEFAULT 'Mostrador',
  total_venta DECIMAL(12,2) NOT NULL,
  monto_efectivo DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  monto_digital DECIMAL(12,2) NOT NULL DEFAULT 0.00,      
  medio_digital ENUM('Nequi','Daviplata','Bre-B') NULL,
  monto_credito DECIMAL(12,2) NOT NULL DEFAULT 0.00,        
  estado ENUM('Confirmada','Anulada') NOT NULL DEFAULT 'Confirmada',
  fecha_venta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ventas_puestos FOREIGN KEY (id_puesto) REFERENCES puestos (id_puesto),
  CONSTRAINT fk_ventas_usuarios FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario),
  CONSTRAINT fk_ventas_clientes FOREIGN KEY (id_cliente) REFERENCES clientes (id_cliente)
) ENGINE=InnoDB COMMENT='Ventas de contado, crédito y mixtas';

CREATE TABLE detalle_venta (
  id_detalle_venta INT AUTO_INCREMENT PRIMARY KEY,
  id_venta INT NOT NULL,
  id_inventario INT NOT NULL,
  cantidad_vendida INT NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(14,2) GENERATED ALWAYS AS (cantidad_vendida * precio_unitario) STORED,
  CONSTRAINT ck_det_venta CHECK (cantidad_vendida > 0),
  CONSTRAINT fk_det_venta_cab FOREIGN KEY (id_venta) REFERENCES ventas (id_venta),
  CONSTRAINT fk_det_venta_inv FOREIGN KEY (id_inventario) REFERENCES inventario_calidades (id_inventario)
) ENGINE=InnoDB COMMENT='Productos vendidos por calidad';

CREATE TABLE credito_cliente (
  id_credito INT AUTO_INCREMENT PRIMARY KEY,
  id_venta INT NOT NULL UNIQUE,
  id_cliente INT NOT NULL,
  monto_original DECIMAL(12,2) NOT NULL,
  saldo_pendiente DECIMAL(12,2) NOT NULL,
  plazo_dias INT NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  estado ENUM('Pendiente','Pagado','Anulado') NOT NULL DEFAULT 'Pendiente',
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cre_ventas FOREIGN KEY (id_venta) REFERENCES ventas (id_venta),
  CONSTRAINT fk_cre_clientes FOREIGN KEY (id_cliente) REFERENCES clientes (id_cliente)
) ENGINE=InnoDB COMMENT='Deuda individual por cada venta a crédito';

CREATE TABLE abonos_cartera (
  id_abono INT AUTO_INCREMENT PRIMARY KEY,
  id_puesto INT NOT NULL,
  id_credito INT NOT NULL,                                -- a qué venta fiada se abona
  id_usuario INT NOT NULL,
  medio_pago ENUM('Efectivo','Nequi','Daviplata','Bre-B') NOT NULL DEFAULT 'Efectivo',
  monto_recibido DECIMAL(12,2) NOT NULL,                      -- lo que entregó el cliente
  monto_aplicado DECIMAL(12,2) NOT NULL,                      -- lo que bajó la deuda
  fecha_abono    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_abonos_puestos FOREIGN KEY (id_puesto) REFERENCES puestos (id_puesto),
  CONSTRAINT fk_abonos_credito FOREIGN KEY (id_credito) REFERENCES credito_cliente (id_credito),
  CONSTRAINT fk_abonos_usuarios FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
) ENGINE=InnoDB COMMENT='Abonos recibidos para el fiado';

CREATE TABLE egresos_caja (
  id_egreso INT AUTO_INCREMENT PRIMARY KEY,
  id_puesto INT NOT NULL,
  id_usuario INT NOT NULL,
  id_proveedor INT NULL,                                      -- solo en pago a proveedor
  id_entrada INT NULL,                                      -- factura que se está pagando
  categoria  ENUM('Pago_proveedor','Gasto_urgencia','Otros') NOT NULL,
  medio_pago ENUM('Efectivo','Nequi','Daviplata','Bre-B') NOT NULL DEFAULT 'Efectivo',
  monto DECIMAL(12,2) NOT NULL,
  nota VARCHAR(255) NULL,
  fecha_egreso DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_egreso_monto CHECK (monto > 0),
  CONSTRAINT fk_egresos_puestos FOREIGN KEY (id_puesto) REFERENCES puestos (id_puesto),
  CONSTRAINT fk_egresos_usuarios FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario),
  CONSTRAINT fk_egresos_proveedores FOREIGN KEY (id_proveedor) REFERENCES proveedores (id_proveedor),
  CONSTRAINT fk_egresos_entradas FOREIGN KEY (id_entrada) REFERENCES entradas_mercancia (id_entrada)
) ENGINE=InnoDB COMMENT='Salidas de dinero: pago a proveedor, gastos de urgencia y otros';

CREATE TABLE ajustes_inventario (
  id_ajuste INT AUTO_INCREMENT PRIMARY KEY,
  id_inventario INT NOT NULL,
  id_usuario INT NOT NULL,
  tipo_ajuste ENUM('Merma','Correccion_conteo') NOT NULL,
  cantidad INT NOT NULL,                                 -- merma: unidades perdidas; conteo: unidades contadas
  motivo VARCHAR(255) NOT NULL,
  fecha_ajuste DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_ajuste_cantidad CHECK (cantidad >= 0),
  CONSTRAINT fk_ajustes_inv FOREIGN KEY (id_inventario) REFERENCES inventario_calidades (id_inventario),
  CONSTRAINT fk_ajustes_usuarios FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
) ENGINE=InnoDB COMMENT='Mermas y correcciones por conteo';

CREATE TABLE cierres_caja (
  id_cierre INT AUTO_INCREMENT PRIMARY KEY,
  id_puesto INT NOT NULL,
  id_usuario INT NOT NULL,
  fecha_cierre DATE NOT NULL,
  efectivo_inicial DECIMAL(12,2) NOT NULL DEFAULT 0.00,       -- base con la que se abrió la caja
  dinero_esperado DECIMAL(12,2) NOT NULL,
  dinero_contado DECIMAL(12,2) NOT NULL,
  diferencia DECIMAL(12,2) NOT NULL,
  explicacion VARCHAR(500) NULL,
  estado ENUM('Cerrado','Con_descuadre') NOT NULL DEFAULT 'Cerrado',
  fecha_registro   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_cierre_dia UNIQUE (id_puesto, fecha_cierre),  -- un cierre por puesto y día
  CONSTRAINT fk_cierres_puestos FOREIGN KEY (id_puesto) REFERENCES puestos (id_puesto),
  CONSTRAINT fk_cierres_usuarios FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
) ENGINE=InnoDB COMMENT='Cierre de caja diario';


--  TRIGGERS

DELIMITER //

--  VALIDACIÓN: los montos de la venta deben sumar el total
CREATE TRIGGER trg_validar_venta BEFORE INSERT ON ventas FOR EACH ROW
BEGIN
  IF NEW.monto_efectivo + NEW.monto_digital + NEW.monto_credito <> NEW.total_venta THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los montos de efectivo, digital y fiado deben sumar el total de la venta.';
  END IF;
  IF NEW.monto_credito > 0 AND NEW.id_cliente IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Una venta a fiado necesita un cliente.';
  END IF;
END //

--  AUTOMATIZACIÓN: si la venta tiene parte fiada, crea la deuda del cliente
CREATE TRIGGER trg_crear_credito AFTER INSERT ON ventas FOR EACH ROW
BEGIN
  DECLARE v_plazo INT;
  IF NEW.monto_credito > 0 THEN
    SELECT plazo_credito_dias INTO v_plazo FROM clientes WHERE id_cliente = NEW.id_cliente;
    INSERT INTO credito_cliente (id_venta, id_cliente, monto_original, saldo_pendiente, plazo_dias, fecha_vencimiento)
    VALUES (NEW.id_venta, NEW.id_cliente, NEW.monto_credito, NEW.monto_credito, v_plazo,
            DATE_ADD(DATE(NEW.fecha_venta), INTERVAL v_plazo DAY));
  END IF;
END //

-- AUTOMATIZACIÓN: al vender una línea, descuenta el stock
CREATE TRIGGER trg_descontar_stock_venta AFTER INSERT ON detalle_venta FOR EACH ROW
BEGIN
  UPDATE inventario_calidades SET stock_actual = stock_actual - NEW.cantidad_vendida
  WHERE id_inventario = NEW.id_inventario;
END //

--  AUTOMATIZACIÓN: al recibir mercancía, suma stock y aumenta lo que se debe al proveedor
CREATE TRIGGER trg_entrada_mercancia AFTER INSERT ON detalle_entrada FOR EACH ROW
BEGIN
  UPDATE inventario_calidades SET stock_actual = stock_actual + NEW.cantidad_recibida
  WHERE id_inventario = NEW.id_inventario;
  UPDATE entradas_mercancia
  SET total_compra = total_compra + NEW.subtotal, saldo_pendiente = saldo_pendiente + NEW.subtotal
  WHERE id_entrada = NEW.id_entrada;
END //

-- AUTOMATIZACIÓN: merma resta; corrección por conteo deja el stock en lo contado
CREATE TRIGGER trg_ajuste_inventario AFTER INSERT ON ajustes_inventario FOR EACH ROW
BEGIN
  IF NEW.tipo_ajuste = 'Merma' THEN
    UPDATE inventario_calidades SET stock_actual = stock_actual - NEW.cantidad
    WHERE id_inventario = NEW.id_inventario;
  ELSE
    UPDATE inventario_calidades SET stock_actual = NEW.cantidad
    WHERE id_inventario = NEW.id_inventario;
  END IF;
END //

--  VALIDACIÓN + AUTOMATIZACIÓN: un pago a proveedor no puede superar su saldo y lo rebaja
CREATE TRIGGER trg_validar_pago_proveedor BEFORE INSERT ON egresos_caja FOR EACH ROW
BEGIN
  DECLARE v_saldo DECIMAL(12,2);
  IF NEW.categoria = 'Pago_proveedor' THEN
    IF NEW.id_entrada IS NULL OR NEW.id_proveedor IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El pago a proveedor necesita proveedor y factura.';
    END IF;
    SELECT saldo_pendiente INTO v_saldo FROM entradas_mercancia WHERE id_entrada = NEW.id_entrada;
    IF NEW.monto > v_saldo THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El pago supera lo que se le debe al proveedor en esa factura.';
    END IF;
    UPDATE entradas_mercancia
    SET estado_pago = IF(saldo_pendiente - NEW.monto = 0, 'Pagado', 'Parcial'),   -- primero el estado (usa el saldo anterior)
        saldo_pendiente = saldo_pendiente - NEW.monto
    WHERE id_entrada = NEW.id_entrada;
  ELSEIF NEW.nota IS NULL OR CHAR_LENGTH(TRIM(NEW.nota)) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los gastos de urgencia y otros necesitan una nota explicativa.';
  END IF;
END //


-- FUNCIONES


--  Deuda total de un cliente
CREATE FUNCTION fn_deuda_cliente(p_id_cliente INT) RETURNS DECIMAL(12,2)
READS SQL DATA
BEGIN
  RETURN IFNULL((SELECT SUM(saldo_pendiente) FROM credito_cliente
                 WHERE id_cliente = p_id_cliente AND estado = 'Pendiente'), 0);
END //

-- Stock disponible de un producto y calidad
CREATE FUNCTION fn_stock_disponible(p_id_inventario INT) RETURNS INT
READS SQL DATA
BEGIN
  RETURN IFNULL((SELECT stock_actual FROM inventario_calidades WHERE id_inventario = p_id_inventario), 0);
END //

-- Efectivo que debería haber en caja = base + ventas en efectivo + abonos en efectivo - egresos en efectivo
CREATE FUNCTION fn_efectivo_esperado(p_id_puesto INT, p_fecha DATE, p_efectivo_inicial DECIMAL(12,2))
RETURNS DECIMAL(12,2)
READS SQL DATA
BEGIN
  RETURN p_efectivo_inicial
    + IFNULL((SELECT SUM(monto_efectivo) FROM ventas
              WHERE id_puesto = p_id_puesto AND DATE(fecha_venta) = p_fecha AND estado = 'Confirmada'), 0)
    + IFNULL((SELECT SUM(monto_recibido) FROM abonos_cartera
              WHERE id_puesto = p_id_puesto AND DATE(fecha_abono) = p_fecha AND medio_pago = 'Efectivo'), 0)
    - IFNULL((SELECT SUM(monto) FROM egresos_caja
              WHERE id_puesto = p_id_puesto AND DATE(fecha_egreso) = p_fecha AND medio_pago = 'Efectivo'), 0);
END //


--  PROCEDIMIENTOS ALMACENADOS 
-- Registrar un abono: aplica solo hasta el saldo y el resto queda como excedente
CREATE PROCEDURE sp_registrar_abono(
  IN p_id_credito INT, IN p_id_usuario INT, IN p_medio_pago VARCHAR(20), IN p_monto DECIMAL(12,2))
BEGIN
  DECLARE v_saldo DECIMAL(12,2);
  DECLARE v_puesto INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT cc.saldo_pendiente, c.id_puesto INTO v_saldo, v_puesto
  FROM credito_cliente cc JOIN clientes c ON c.id_cliente = cc.id_cliente
  WHERE cc.id_credito = p_id_credito AND cc.estado = 'Pendiente' FOR UPDATE;

  IF v_saldo IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta deuda no existe o ya está pagada.';
  ELSEIF p_monto <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El abono debe ser mayor a cero.';
  END IF;

  INSERT INTO abonos_cartera (id_puesto, id_credito, id_usuario, medio_pago, monto_recibido, monto_aplicado)
  VALUES (v_puesto, p_id_credito, p_id_usuario, p_medio_pago, p_monto, LEAST(p_monto, v_saldo));

  UPDATE credito_cliente
  SET estado = IF(v_saldo - LEAST(p_monto, v_saldo) = 0, 'Pagado', 'Pendiente'),
      saldo_pendiente = v_saldo - LEAST(p_monto, v_saldo)
  WHERE id_credito = p_id_credito;
  COMMIT;
END //

-- Anular una venta: devuelve el stock y anula la deuda si la tenía
CREATE PROCEDURE sp_anular_venta(IN p_id_venta INT)
BEGIN
  DECLARE v_estado VARCHAR(15);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT estado INTO v_estado FROM ventas WHERE id_venta = p_id_venta FOR UPDATE;
  IF v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La venta no existe.';
  ELSEIF v_estado = 'Anulada' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La venta ya estaba anulada.';
  END IF;

  UPDATE inventario_calidades ic JOIN detalle_venta dv ON dv.id_inventario = ic.id_inventario
  SET ic.stock_actual = ic.stock_actual + dv.cantidad_vendida
  WHERE dv.id_venta = p_id_venta;

  UPDATE credito_cliente SET estado = 'Anulado' WHERE id_venta = p_id_venta;
  UPDATE ventas SET estado = 'Anulada' WHERE id_venta = p_id_venta;
  COMMIT;
END //

-- Cerrar la caja del día: calcula lo esperado, la diferencia y guarda el cierre
CREATE PROCEDURE sp_cerrar_caja(
  IN p_id_puesto INT, IN p_id_usuario INT, IN p_efectivo_inicial DECIMAL(12,2),
  IN p_dinero_contado DECIMAL(12,2), IN p_explicacion VARCHAR(500))
BEGIN
  DECLARE v_esperado DECIMAL(12,2);
  DECLARE v_dif DECIMAL(12,2);
  DECLARE v_umbral DECIMAL(12,2);

  SELECT umbral_descuadre INTO v_umbral FROM puestos WHERE id_puesto = p_id_puesto;
  SET v_esperado = fn_efectivo_esperado(p_id_puesto, CURDATE(), p_efectivo_inicial);
  SET v_dif = p_dinero_contado - v_esperado;

  IF ABS(v_dif) > v_umbral AND (p_explicacion IS NULL OR CHAR_LENGTH(TRIM(p_explicacion)) = 0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La diferencia supera el límite permitido. Escribe una explicación para cerrar.';
  END IF;

  INSERT INTO cierres_caja (id_puesto, id_usuario, fecha_cierre, efectivo_inicial, dinero_esperado,
                            dinero_contado, diferencia, explicacion, estado)
  VALUES (p_id_puesto, p_id_usuario, CURDATE(), p_efectivo_inicial, v_esperado, p_dinero_contado, v_dif,
          p_explicacion, IF(ABS(v_dif) > v_umbral, 'Con_descuadre', 'Cerrado'));

  SELECT v_esperado AS dinero_esperado, p_dinero_contado AS dinero_contado, v_dif AS diferencia;
END //

DELIMITER ;


-- VISTAS 

CREATE VIEW v_ventas_diarias AS
SELECT id_puesto, DATE(fecha_venta) AS fecha, canal, COUNT(*) AS cantidad_ventas,
       SUM(total_venta) AS total_venta, SUM(monto_efectivo) AS efectivo,
       SUM(monto_digital) AS digital, SUM(monto_credito) AS credito
FROM ventas WHERE estado = 'Confirmada'
GROUP BY id_puesto, DATE(fecha_venta), canal;

CREATE VIEW v_cartera_vencida AS
SELECT cc.id_credito, c.id_puesto, c.nombre_completo, c.telefono,
       cc.fecha_vencimiento, DATEDIFF(CURDATE(), cc.fecha_vencimiento) AS dias_mora,
       cc.saldo_pendiente
FROM credito_cliente cc JOIN clientes c ON c.id_cliente = cc.id_cliente
WHERE cc.estado = 'Pendiente' AND cc.fecha_vencimiento < CURDATE();

CREATE VIEW v_alertas_inventario AS
SELECT p.id_puesto, p.nombre_producto, ic.calidad, ic.stock_actual, ic.stock_minimo
FROM inventario_calidades ic JOIN productos p ON p.id_producto = ic.id_producto
WHERE ic.stock_actual <= ic.stock_minimo;


INSERT INTO puestos (id_puesto, nombre_puesto) VALUES (1, 'Comercializadora LEDGERA - Puesto 104'), (2, 'Distribuidora El Campesino - Puesto 208');

INSERT INTO usuarios (id_usuario, id_puesto, usuario, nombre_completo, num_identificacion, password_hash, rol) VALUES
 (1, 1, 'cmendoza', 'Carlos Mendoza',       '1018293801', 'hash_de_prueba', 'Dueno'),
 (2, 2, 'mrojas',   'María Rojas',          '1018293802', 'hash_de_prueba', 'Dueno'),
 (3, 1, 'afelipe',  'Andrés Felipe',        '1018293803', 'hash_de_prueba', 'Vendedor'),
 (4, NULL, 'soporte', 'Soporte Técnico ','1018293800', 'hash_de_prueba', 'Administrador');

INSERT INTO proveedores (id_proveedor, id_puesto, nombre_razon_social, telefono, contacto_principal) VALUES
 (1, 1, 'Don Pedro - Finca El Salitre', '3109876543', 'Pedro Gómez'),
 (2, 1, 'AgroInversiones del Oriente S.A.S.', '3112345678', 'Jorge Martínez');

INSERT INTO clientes (id_cliente, id_puesto, nombre_completo, telefono, plazo_credito_dias) VALUES
 (1, 1, 'Don Juan', '3201112233', 15),
 (2, 1, 'María Rodríguez (Fruver Suba)', '3154445566', 10),
 (3, 1, 'Héctor Gómez', '3187776655', 15);

INSERT INTO productos (id_producto, id_puesto, nombre_producto, descripcion) VALUES 
(1, 1, 'Papa pastusa', 'Bultos de 50 kg'), (2, 1, 'Tomate chonto', 'Canastillas de 22 kg'),
(3, 1, 'Cebolla larga', 'Atados de Aquitania');

INSERT INTO inventario_calidades (id_inventario, id_producto, calidad, stock_actual, stock_minimo, precio_venta_diario) VALUES
 (1, 1, 'Extra', 60, 20, 95000), (2, 1, 'Primera', 40, 15, 85000),
 (3, 2, 'Extra', 35, 10, 65000), (4, 3, 'Primera', 30, 10, 40000);

-- Entrada de mercancía: el trigger suma el stock y calcula el total y el saldo
INSERT INTO entradas_mercancia (id_entrada, id_puesto, id_proveedor, id_usuario, documento_soporte) VALUES (1, 1, 1, 1, 'REM-2026-001');
INSERT INTO detalle_entrada (id_entrada, id_inventario, cantidad_recibida, costo_unitario) VALUES (1, 1, 20, 75000), (1, 3, 10, 30000);                       

-- Ventas (el trigger crea el fiado y descuenta stock)
INSERT INTO ventas (id_venta, id_puesto, id_usuario, id_cliente, canal, total_venta, monto_efectivo, monto_digital, medio_digital, monto_credito) VALUES
 (1, 1, 1, NULL, 'Mostrador', 190000, 190000,      0, NULL,    0),
 (2, 1, 3, 1,    'Mostrador', 340000,      0,      0, NULL,    340000),
 (3, 1, 3, NULL, 'Domicilio', 130000,      0, 130000, 'Nequi', 0),
 (4, 1, 3, 2,    'Mostrador', 255000,  55000,      0, NULL,    200000);
 
INSERT INTO detalle_venta (id_venta, id_inventario, cantidad_vendida, precio_unitario) VALUES
 (1, 1, 2, 95000), (2, 2, 4, 85000), (3, 3, 2, 65000), (4, 2, 3, 85000);

INSERT INTO egresos_caja (id_puesto, id_usuario, categoria, monto, nota) VALUES(1, 3, 'Gasto_urgencia', 30000, 'Descargue camión de papa');
INSERT INTO egresos_caja (id_puesto, id_usuario, id_proveedor, id_entrada, categoria, monto) VALUES (1, 1, 1, 1, 'Pago_proveedor', 200000);

-- Abono de Don Juan por el procedimiento: $100.000 en efectivo a su deuda (id_credito 1)
CALL sp_registrar_abono(1, 3, 'Efectivo', 100000);

-- SELECT fn_deuda_cliente(1);                              -- 240000
-- SELECT fn_stock_disponible(2);                           -- 33
-- SELECT fn_efectivo_esperado(1, CURDATE(), 200000);       -- 315000
-- CALL sp_cerrar_caja(1, 1, 200000, 315000, NULL);         -- cierra sin diferencia
-- CALL sp_anular_venta(2);                                 -- devuelve stock y anula el fiado
-- SELECT * FROM v_alertas_inventario;
-- SELECT * FROM v_cartera_vencida;
USE ledgera;
SELECT * FROM v_ventas_diarias;

UPDATE usuarios SET password_hash = '$2y$10$.gUZKfDl0dbq1SP/t5xxpuxC4nMIzYH5HpYL3/8uyzoEdM9TvgtmC' WHERE usuario = 'soporte';
ALTER TABLE usuarios ADD COLUMN debe_cambiar_clave TINYINT(1) NOT NULL DEFAULT 0;

select * from usuarios;

SELECT usuario, debe_cambiar_clave FROM usuarios;

ALTER TABLE clientes ADD COLUMN consentimiento_datos DATETIME NULL;
CREATE INDEX idx_ventas_puesto_fecha ON ventas (id_puesto, fecha_venta);
ALTER TABLE ajustes_inventario MODIFY tipo_ajuste ENUM('Merma','Devolucion','Correccion_conteo') NOT NULL;
DROP TRIGGER IF EXISTS trg_ajuste_inventario;


DELIMITER //
CREATE TRIGGER trg_ajuste_inventario AFTER INSERT ON ajustes_inventario FOR EACH ROW
BEGIN
  IF NEW.tipo_ajuste = 'Merma' THEN
    UPDATE inventario_calidades SET stock_actual = stock_actual - NEW.cantidad
    WHERE id_inventario = NEW.id_inventario;
  ELSEIF NEW.tipo_ajuste = 'Devolucion' THEN
    UPDATE inventario_calidades SET stock_actual = stock_actual + NEW.cantidad
    WHERE id_inventario = NEW.id_inventario;
  ELSE
    UPDATE inventario_calidades SET stock_actual = NEW.cantidad
    WHERE id_inventario = NEW.id_inventario;
  END IF;
END //
DELIMITER ;

CREATE INDEX idx_entradas_puesto_fecha ON entradas_mercancia (id_puesto, fecha_entrada);