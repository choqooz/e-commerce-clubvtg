import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface DispatchEmailProps {
  customerName: string;
  orderId: string;
  trackingNumber: string;
  items: { title: string; price: number }[];
}

export const DispatchEmail = ({
  customerName,
  orderId,
  trackingNumber,
  items,
}: DispatchEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Tu pedido #{orderId.slice(0, 8)} está en camino</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>¡Tu pedido está en camino!</Heading>

          <Section style={bodySection}>
            <Text style={text}>
              Hola {customerName}, tu pedido ya fue despachado.
            </Text>

            <Section style={detailsContainer}>
              <Text style={detailItem}>
                <strong>Nº de Orden:</strong> #{orderId.slice(0, 8)}
              </Text>
              <Text style={trackingStyle}>
                <strong>Tracking:</strong> {trackingNumber}
              </Text>
            </Section>

            <Text style={text}>
              Podés seguir tu envío en{" "}
              <strong>correoargentino.com.ar</strong>
            </Text>

            <Hr style={hr} />

            <Text style={itemsHeading}>Productos en tu pedido:</Text>
            {items.map((item, i) => (
              <Text key={i} style={itemRow}>
                {item.title} — ${item.price.toLocaleString("es-AR")}
              </Text>
            ))}

            <Text style={footer}>
              Gracias por tu compra — <strong>ClubVTG</strong>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default DispatchEmail;

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px",
  borderRadius: "5px",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  maxWidth: "600px",
};

const h1 = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "0 0 20px",
  padding: "0",
  textAlign: "center" as const,
};

const bodySection = {
  padding: "20px 0",
};

const text = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 20px",
};

const detailsContainer = {
  backgroundColor: "#f4f4f4",
  padding: "20px",
  borderRadius: "5px",
  margin: "0 0 20px",
};

const detailItem = {
  margin: "0 0 10px",
  fontSize: "15px",
  color: "#444",
};

const trackingStyle = {
  margin: "0",
  fontSize: "18px",
  fontWeight: "bold" as const,
  color: "#333",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "20px 0",
};

const itemsHeading = {
  color: "#333",
  fontSize: "14px",
  fontWeight: "bold" as const,
  margin: "0 0 10px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const itemRow = {
  color: "#555",
  fontSize: "15px",
  lineHeight: "22px",
  margin: "0 0 6px",
};

const footer = {
  color: "#8898aa",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "40px 0 0",
};
