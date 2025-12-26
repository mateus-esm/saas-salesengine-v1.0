const Footer = () => {
  return (
    <footer className="py-12 bg-background border-t border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo/Brand */}
          <div className="text-2xl font-bold">
            <span className="text-gradient">MAV</span>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-gold transition-colors">
              Termos de Uso
            </a>
            <a href="#" className="hover:text-gold transition-colors">
              Política de Privacidade
            </a>
            <a href="#" className="hover:text-gold transition-colors">
              Contato
            </a>
            <a href="#" className="hover:text-gold transition-colors">
              Suporte
            </a>
          </nav>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Máquina Automática de Vendas. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
