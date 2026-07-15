CREATE TABLE `product_offers` (
  `id` text PRIMARY KEY NOT NULL,
  `product` text NOT NULL,
  `region` text NOT NULL,
  `region_name` text NOT NULL,
  `price_7` real NOT NULL,
  `price_30` real NOT NULL,
  `price_90` real NOT NULL,
  `sale_stock` integer DEFAULT 0 NOT NULL,
  `sold` integer DEFAULT 0 NOT NULL,
  `enabled` integer DEFAULT true NOT NULL,
  `sort_order` integer DEFAULT 100 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX `product_offers_product_region_unique` ON `product_offers` (`product`,`region`);
INSERT INTO `product_offers` VALUES
('offer-static-us','static-isp','US','美国',1.33,3.80,9.69,500,0,1,10,unixepoch(),unixepoch()),
('offer-static-gb','static-isp','GB','英国',1.47,4.20,10.71,300,0,1,20,unixepoch(),unixepoch()),
('offer-static-de','static-isp','DE','德国',1.40,4.00,10.20,300,0,1,30,unixepoch(),unixepoch()),
('offer-static-jp','static-isp','JP','日本',1.68,4.80,12.24,200,0,1,40,unixepoch(),unixepoch()),
('offer-static-sg','static-isp','SG','新加坡',1.61,4.60,11.73,200,0,1,50,unixepoch(),unixepoch()),
('offer-static-hk','static-isp','HK','中国香港',1.58,4.50,11.48,200,0,1,60,unixepoch(),unixepoch());
