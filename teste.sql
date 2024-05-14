--
-- This is an example query
--
SELECT
	foo
FROM
	mytable mt
JOIN orders as o ON customers.customer_id = orders.customer_id
JOIN
    order_details using (id)
WHERE
	foo LIKE '%neat%'
group by foo, bar
having gaming
-- JOIN
--     products ON order_details.product_id = products.product_id
-- WHERE
--     customers.country = 'USA' AND orders.order_date BETWEEN '2022-01-01' AND '2022-12-31'
--
