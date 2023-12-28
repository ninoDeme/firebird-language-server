SELECT first 1
    *
FROM
 (select * from dsadasdqwd)
JOIN orders ON customers.customer_id = orders.customer_id
-- JOIN
--     order_details ON orders.order_id = order_details.order_id
-- JOIN
--     products ON order_details.product_id = products.product_id
-- WHERE
--     customers.country = 'USA' AND orders.order_date BETWEEN '2022-01-01' AND '2022-12-31'