import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface ReceiptEmailProps {
  customerName: string;
  orderId: string;
  totalAmount: number;
}

export const ReceiptEmail = ({
  customerName,
  orderId,
  totalAmount,
}: ReceiptEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>¡Tu pago en ClubVTG ha sido confirmado!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>¡Gracias por tu compra, {customerName}!</Heading>
          
          <Section style={bodySection}>
            <Text style={text}>
              Tu pago ha sido procesado exitosamente y ya comenzamos a preparar tu pedido.
            </Text>
            
            <Section style={detailsContainer}>
              <Text style={detailItem}>
                <strong>Nº de Orden:</strong> {orderId}
              </Text>
              <Text style={detailItem}>
                <strong>Total Pagado:</strong> ${totalAmount.toLocaleString('es-AR')}
              </Text>
            </Section>

            <Text style={text}>
              Te enviaremos otro correo cuando tu pedido sea despachado a través de Correo Argentino.
            </Text>

            <Text style={footer}>
              Si tenés alguna duda, respondé a este correo o contactanos por Instagram.
              <br />
              <br />
              <strong>ClubVTG</strong>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default ReceiptEmail;

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

const footer = {
  color: "#8898aa",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "40px 0 0",
};
